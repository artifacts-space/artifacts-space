import { describe, expect, it } from "vitest";

import { isUndeliverableSendError, UNDELIVERABLE_ADDRESS_CODE, undeliverableAddressMessage } from "./undeliverable-address";

describe("isUndeliverableSendError", () => {
  it.each(["recipient_undeliverable", "recipient_suppressed"])("should be true when Sendir answers 422 %s", (name) => {
    expect(isUndeliverableSendError({ statusCode: 422, name, message: "No." })).toBe(true);
  });

  it("should be false when the failure is anything else", () => {
    expect(isUndeliverableSendError(null)).toBe(false);
    expect(isUndeliverableSendError({ statusCode: 422, name: "refused", message: "The send was refused" })).toBe(false);
    expect(isUndeliverableSendError({ statusCode: 400, name: "recipient_undeliverable", message: "No." })).toBe(false);
    expect(isUndeliverableSendError({ statusCode: null, name: "network_error", message: "Sendir could not be reached" })).toBe(false);
    expect(isUndeliverableSendError({ statusCode: 500, name: "unexpected_response", message: "Sendir answered 500" })).toBe(false);
  });
});

describe("undeliverableAddressMessage", () => {
  it("should name the typed address when the code says it cannot receive mail", () => {
    expect(undeliverableAddressMessage(UNDELIVERABLE_ADDRESS_CODE, "sam@gmial.con")).toBe("We can't send email to sam@gmial.con. Check it for a typo.");
  });

  it("should say this address when none was typed", () => {
    expect(undeliverableAddressMessage(UNDELIVERABLE_ADDRESS_CODE, "")).toBe("We can't send email to this address. Check it for a typo.");
  });

  it("should leave every other refusal alone when the code is different or missing", () => {
    expect(undeliverableAddressMessage("RATE_LIMITED", "sam@example.com")).toBeNull();
    expect(undeliverableAddressMessage(undefined, "sam@example.com")).toBeNull();
  });
});
