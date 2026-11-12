import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { magicLink } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UNDELIVERABLE_ADDRESS_CODE } from "@/lib/auth/undeliverable-address";
import { INVITATION_BUDGET_MESSAGE } from "@/lib/email/budget-rules";
import { withInvitationSendRefusal } from "@/lib/teams/invitation-send-refusal";

/*
 * A team invitation whose email Sendir refuses, through a real Better Auth
 * (1.7) organization plugin with the app's teams options. Better Auth logs
 * and swallows what `sendInvitationEmail` throws, so `createInvitation`
 * returns normally and leaves its pending row; these tests pin that, and
 * that the refusal still reaches a caller that listens for it. The memory
 * adapter stands in for Postgres, the guards and counters that read Postgres
 * are mocked, and `fetch` answers for Sendir.
 */

const mocks = vi.hoisted(() => ({ reserveBudgetedEmail: vi.fn<() => Promise<boolean>>() }));

vi.mock("@/lib/teams/guards", async (importOriginal) => ({ ...(await importOriginal<object>()), assertCanInviteAs: vi.fn() }));
vi.mock("@/lib/teams/invitation-limits", () => ({ assertCanInvite: vi.fn(), assertCanCreateTeam: vi.fn() }));
vi.mock("@/lib/teams/invitation-queries", () => ({ cancelOlderOpenInvitations: vi.fn() }));
vi.mock("@/lib/email/budget", () => ({ reserveBudgetedEmail: mocks.reserveBudgetedEmail }));

const { teamsPlugin } = await import("./teams-plugin");

const site = "https://artifacts.space";
const sendirUrl = "https://sendir.test";
const teamId = "team-1";

interface Row extends Record<string, unknown> {
  id: string;
}

type Tables = Record<string, Row[]>;

const sentLinks: string[] = [];

function createTestAuth(tables: Tables) {
  return betterAuth({
    baseURL: site,
    secret: "teams-send-refusal-test-secret-0123456789",
    database: memoryAdapter(tables),
    emailAndPassword: { enabled: false },
    plugins: [magicLink({ sendMagicLink: ({ url }) => { sentLinks.push(url); } }), teamsPlugin()],
    advanced: { disableOriginCheck: false },
  });
}

type TestAuth = ReturnType<typeof createTestAuth>;

/** Signs the owner in with a magic link and returns their session cookie and user id. */
async function signInOwner(auth: TestAuth, tables: Tables) {
  await auth.handler(new Request(`${site}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: site },
    body: JSON.stringify({ email: "owner@example.com", callbackURL: `${site}/app` }),
  }));
  const link = sentLinks.at(-1);
  if (!link) throw new Error("No magic link was sent.");
  const response = await auth.handler(new Request(link));
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0] ?? "").join("; ");
  const userId = tables.user?.[0]?.id ?? "";
  return { cookie, userId };
}

/** Answers every Sendir send with `status` and `body`. */
function stubSendir(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (new URL(url).origin !== sendirUrl) return Promise.reject(new Error(`Unexpected request to ${url}`));
    return Promise.resolve(Response.json(body, { status }));
  });
}

describe("refused team invitation emails", () => {
  let tables: Tables;
  let auth: TestAuth;
  let invite: (email: string) => Promise<{ id: string }>;

  beforeEach(async () => {
    vi.stubEnv("BETTER_AUTH_URL", site);
    vi.stubEnv("SENDIR_API_KEY", "test-key");
    vi.stubEnv("SENDIR_IDENTITY_ID", "test-identity");
    vi.stubEnv("SENDIR_URL", sendirUrl);
    mocks.reserveBudgetedEmail.mockResolvedValue(true);
    tables = { user: [], session: [], account: [], verification: [], organization: [], member: [], invitation: [] };
    auth = createTestAuth(tables);
    const { cookie, userId } = await signInOwner(auth, tables);
    const now = new Date();
    tables.organization?.push({ id: teamId, name: "Northwind", slug: "northwind", personal: false, teamSharingNeedsApproval: true, createdAt: now });
    tables.member?.push({ id: "member-owner", teamId, userId, role: "owner", createdAt: now });
    invite = (email) => auth.api.createInvitation({ body: { email, role: "member", organizationId: teamId }, headers: new Headers({ cookie }) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("should return as if sent and keep the pending row when nobody listens for the refusal", async () => {
    const sendir = stubSendir(422, { error: { type: "recipient_undeliverable", message: "No mail server." } });

    const created = await invite("ann@typo.example.com");

    expect(sendir).toHaveBeenCalledTimes(1);
    expect(tables.invitation).toEqual([expect.objectContaining({ id: created.id, status: "pending" })]);
  });

  it.each(["recipient_undeliverable", "recipient_suppressed"])(
    "should hand the caller the undeliverable code when Sendir answers %s",
    async (type) => {
      stubSendir(422, { error: { type, message: "The recipient cannot receive mail." } });

      const { result, refusal } = await withInvitationSendRefusal(() => invite("ann@typo.example.com"));

      expect(refusal?.status).toBe("UNPROCESSABLE_ENTITY");
      expect(refusal?.body?.code).toBe(UNDELIVERABLE_ADDRESS_CODE);
      expect(tables.invitation?.map((row) => row.id)).toEqual([result.id]);
    },
  );

  it("should hand the caller the budget message when the daily email budget is used up", async () => {
    const sendir = stubSendir(201, { data: { id: "msg-1", status: "queued" } });
    mocks.reserveBudgetedEmail.mockResolvedValue(false);

    const { refusal } = await withInvitationSendRefusal(() => invite("ann@example.com"));

    expect(refusal?.message).toBe(INVITATION_BUDGET_MESSAGE);
    expect(sendir).not.toHaveBeenCalled();
  });

  it("should report no refusal when Sendir accepts or fails for another reason", async () => {
    stubSendir(201, { data: { id: "msg-1", status: "queued" } });
    expect((await withInvitationSendRefusal(() => invite("ann@example.com"))).refusal).toBeNull();

    vi.restoreAllMocks();
    stubSendir(503, { error: { type: "unavailable", message: "Down." } });
    expect((await withInvitationSendRefusal(() => invite("bea@example.com"))).refusal).toBeNull();
  });
});
