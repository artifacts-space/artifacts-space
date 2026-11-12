import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { magicLink } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { magicLinkPluginOptions } from "@/lib/auth/magic-link-email";
import { UNDELIVERABLE_ADDRESS_CODE } from "@/lib/auth/undeliverable-address";

/*
 * A sign-in link to an address Sendir says cannot receive mail, through the
 * real auth route and a real Better Auth (1.7) with the app's magic-link
 * options. Only the boundaries are swapped: the memory adapter stands in for
 * Postgres, the rate-limit counters (Postgres too) are mocked, and `fetch`
 * answers for Sendir. These fail if a known and an unknown address could get
 * different answers, or if a refused address were checked before the limits.
 */

const site = "https://artifacts.space";
const sendirUrl = "https://sendir.test";

interface Row extends Record<string, unknown> {
  id: string;
}

const tables: Record<string, Row[]> = { user: [], session: [], account: [], verification: [] };

function createTestAuth() {
  return betterAuth({
    baseURL: site,
    secret: "undeliverable-address-test-secret-0123456789",
    database: memoryAdapter(tables),
    emailAndPassword: { enabled: false },
    plugins: [magicLink(magicLinkPluginOptions)],
    advanced: { disableOriginCheck: false },
  });
}

const mocks = vi.hoisted(() => ({ hitRateLimits: vi.fn<() => Promise<{ name: string; retryAfterSeconds: number } | null>>() }));

vi.mock("@/lib/auth/server", () => {
  const auth = createTestAuth();
  return { getAuth: () => auth };
});
vi.mock("@/lib/abuse/rate-limit", async (importOriginal) => ({ ...(await importOriginal<object>()), hitRateLimits: mocks.hitRateLimits }));

const { POST } = await import("./route");

/** Someone with an account, and someone without one, at the same mistyped domain. */
const known = "sam@typo.example.com";
const unknown = "nobody@typo.example.com";

/** Answers every Sendir send with `status` and `body`, and counts the sends. */
function stubSendir(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (new URL(url).origin !== sendirUrl) return Promise.reject(new Error(`Unexpected request to ${url}`));
    return Promise.resolve(Response.json(body, { status }));
  });
}

/** Asks for a sign-in link as the sign-in form does, and reads the whole answer. */
async function askForLink(email: string) {
  const response = await POST(
    new Request(`${site}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: site, "x-forwarded-for": "198.18.0.1" },
      body: JSON.stringify({ email, callbackURL: `${site}/app` }),
    }),
  );
  return { status: response.status, contentType: response.headers.get("content-type"), retryAfter: response.headers.get("retry-after"), body: await response.text() };
}

describe("sign-in link to an address that cannot receive mail", () => {
  beforeEach(() => {
    for (const rows of Object.values(tables)) rows.length = 0;
    const now = new Date();
    tables.user?.push({ id: "known-user", email: known, emailVerified: true, name: "Sam", image: null, createdAt: now, updatedAt: now });
    vi.stubEnv("BETTER_AUTH_URL", site);
    vi.stubEnv("BETTER_AUTH_SECRET", "undeliverable-address-test-secret-0123456789");
    vi.stubEnv("SENDIR_API_KEY", "test-key");
    vi.stubEnv("SENDIR_IDENTITY_ID", "test-identity");
    vi.stubEnv("SENDIR_URL", sendirUrl);
    mocks.hitRateLimits.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["recipient_undeliverable", "recipient_suppressed"])(
    "should answer 422 with the stable code, alike for known and unknown addresses, when Sendir answers %s",
    async (type) => {
      const sendir = stubSendir(422, { error: { type, message: "The recipient cannot receive mail." } });

      const forKnown = await askForLink(known);
      const forUnknown = await askForLink(unknown);

      expect(forKnown.status).toBe(422);
      expect(JSON.parse(forKnown.body)).toEqual({ code: UNDELIVERABLE_ADDRESS_CODE, message: "We can't send email to this address. Check it for a typo." });
      expect(forUnknown).toEqual(forKnown);
      // The send hook ran once for each address: Better Auth never skips it for an address without an account.
      expect(sendir).toHaveBeenCalledTimes(2);
    },
  );

  it("should never name the address in the answer when the address is refused", async () => {
    stubSendir(422, { error: { type: "recipient_undeliverable", message: "No mail server for typo.example.com." } });

    const { body } = await askForLink(known);

    expect(body).not.toContain("typo.example.com");
    expect(body).not.toContain("sam");
  });

  it("should answer 200 alike for known and unknown addresses when Sendir accepts the send", async () => {
    const sendir = stubSendir(201, { data: { id: "msg-1", status: "queued" } });

    const forKnown = await askForLink(known);
    const forUnknown = await askForLink(unknown);

    expect(forKnown.status).toBe(200);
    expect(forUnknown).toEqual(forKnown);
    expect(sendir).toHaveBeenCalledTimes(2);
  });

  it("should keep a plain failure, with no undeliverable code, when Sendir refuses for another reason", async () => {
    stubSendir(422, { error: { type: "validation_error", message: "Bad request." } });

    const answer = await askForLink(known);

    expect(answer.status).toBe(500);
    expect(answer.body).not.toContain(UNDELIVERABLE_ADDRESS_CODE);
  });

  it("should refuse with today's rate-limit answer and never ask Sendir when the limits refuse first", async () => {
    const sendir = stubSendir(422, { error: { type: "recipient_undeliverable", message: "No mail server." } });
    mocks.hitRateLimits.mockResolvedValue({ name: "magicLinkByNetworkMinute", retryAfterSeconds: 42 });

    const forKnown = await askForLink(known);
    const forUnknown = await askForLink(unknown);

    expect(forKnown.status).toBe(429);
    expect(forKnown.retryAfter).toBe("42");
    expect(JSON.parse(forKnown.body)).toEqual({ code: "RATE_LIMITED", message: expect.stringContaining("Try again in") as unknown });
    expect(forUnknown).toEqual(forKnown);
    expect(sendir).not.toHaveBeenCalled();
    expect(tables.verification).toHaveLength(0);
  });
});
