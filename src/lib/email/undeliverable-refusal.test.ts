import { isAPIError } from "better-auth/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMagicLinkEmail } from "@/lib/auth/magic-link-email";
import { UNDELIVERABLE_ADDRESS_CODE } from "@/lib/auth/undeliverable-address";
import { sendTeamInvitationEmail } from "@/lib/teams/invitation-email";

/*
 * Sendir's answer mapped to what the sign-in link and invitation senders
 * throw. Sendir is stood in for at the network boundary (`fetch`), so the
 * real client in src/lib/sendir.ts reads each answer. Only an address that
 * cannot receive mail becomes the 422 with the stable code; every other
 * failure stays a plain error.
 */

vi.mock("@/lib/email/budget", () => ({ reserveBudgetedEmail: () => Promise.resolve(true) }));

const sendirUrl = "https://sendir.test";

const senders = {
  "sign-in link": () => sendMagicLinkEmail({ email: "sam@gmial.con", url: "https://artifacts.space/api/auth/magic-link/verify?token=t1", token: "t1" }),
  invitation: () => sendTeamInvitationEmail({ invitationId: "inv-1", email: "sam@gmial.con", teamName: "Northwind", inviterName: "Dana", expiresAt: new Date("2026-11-19T12:00:00.000Z") }),
};

function answerWith(answer: () => Promise<Response>) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (new URL(url).origin !== sendirUrl) return Promise.reject(new Error(`Unexpected request to ${url}`));
    return answer();
  });
}

const refusal = (type: string, status = 422) => () => Promise.resolve(Response.json({ error: { type, message: "No mail server for gmial.con." } }, { status }));

async function thrownBy(send: () => Promise<void>): Promise<unknown> {
  try {
    await send();
  } catch (error) {
    return error;
  }
  return null;
}

describe.each(Object.entries(senders))("the %s sender", (_name, send) => {
  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_URL", "https://artifacts.space");
    vi.stubEnv("SENDIR_API_KEY", "test-key");
    vi.stubEnv("SENDIR_IDENTITY_ID", "test-identity");
    vi.stubEnv("SENDIR_URL", sendirUrl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["recipient_undeliverable", "recipient_suppressed"])("should throw a 422 with the stable code when Sendir answers 422 %s", async (type) => {
    answerWith(refusal(type));

    const error = await thrownBy(send);

    expect(isAPIError(error)).toBe(true);
    expect(error).toMatchObject({ status: "UNPROCESSABLE_ENTITY", statusCode: 422, body: { code: UNDELIVERABLE_ADDRESS_CODE } });
    expect(JSON.stringify(error)).not.toContain("gmial");
  });

  it.each([
    ["another 422 type", refusal("validation_error")],
    ["a 400 with the same type", refusal("recipient_undeliverable", 400)],
    ["an outage", refusal("internal_error", 503)],
    ["no answer", () => Promise.reject(new Error("socket hang up"))],
  ])("should keep the plain error when Sendir gives %s", async (_case, answer) => {
    answerWith(answer);

    const error = await thrownBy(send);

    expect(error).toBeInstanceOf(Error);
    expect(isAPIError(error)).toBe(false);
  });

  it("should send without throwing when Sendir accepts the email", async () => {
    answerWith(() => Promise.resolve(Response.json({ data: { id: "msg-1", status: "queued" } }, { status: 201 })));

    await expect(send()).resolves.toBeUndefined();
  });
});
