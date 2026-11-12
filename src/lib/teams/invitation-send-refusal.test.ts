import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";

import { UNDELIVERABLE_ADDRESS_CODE } from "@/lib/auth/undeliverable-address";
import { INVITATION_BUDGET_CODE } from "@/lib/email/budget-rules";

import { isInvitationSendRefusal, noteInvitationSendRefusal, withInvitationSendRefusal } from "./invitation-send-refusal";

const undeliverable = new APIError("UNPROCESSABLE_ENTITY", { code: UNDELIVERABLE_ADDRESS_CODE, message: "We can't send email to this address." });
const overBudget = new APIError("TOO_MANY_REQUESTS", { code: INVITATION_BUDGET_CODE, message: "Too many invitations today." });

describe("isInvitationSendRefusal", () => {
  it("should be true when the send was refused for an address that cannot receive mail or for the daily budget", () => {
    expect(isInvitationSendRefusal(undeliverable)).toBe(true);
    expect(isInvitationSendRefusal(overBudget)).toBe(true);
  });

  it("should be false when the error is any other API error, a plain error, or not an error", () => {
    expect(isInvitationSendRefusal(new APIError("FORBIDDEN", { code: "NOT_ALLOWED", message: "No." }))).toBe(false);
    expect(isInvitationSendRefusal(new APIError("TOO_MANY_REQUESTS", { message: "Slow down." }))).toBe(false);
    expect(isInvitationSendRefusal(new Error("Sendir is down"))).toBe(false);
    expect(isInvitationSendRefusal(null)).toBe(false);
  });
});

describe("withInvitationSendRefusal", () => {
  it("should hand back a refusal when one is noted inside the call", async () => {
    const { result, refusal } = await withInvitationSendRefusal(() => {
      noteInvitationSendRefusal(undeliverable);
      return Promise.resolve("created");
    });
    expect(result).toBe("created");
    expect(refusal).toBe(undeliverable);
  });

  it("should hand back no refusal when the send failed for another reason, so the invitation is kept", async () => {
    const { refusal } = await withInvitationSendRefusal(() => {
      noteInvitationSendRefusal(new APIError("FORBIDDEN", { code: "NOT_ALLOWED", message: "No." }));
      noteInvitationSendRefusal(new Error("Sendir is down"));
      return Promise.resolve("created");
    });
    expect(refusal).toBeNull();
  });

  it("should note nothing when no caller is listening", () => {
    expect(() => { noteInvitationSendRefusal(overBudget); }).not.toThrow();
  });
});
