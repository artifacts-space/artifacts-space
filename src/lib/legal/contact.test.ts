import { describe, expect, it } from "vitest";

import { legalContact, mailtoHref, postalAddress } from "./contact";

describe("legal contact", () => {
  it("should keep both mailboxes on the artifacts.space domain", () => {
    expect(legalContact.privacyEmail).toMatch(/^[a-z]+@artifacts\.space$/);
    expect(legalContact.legalEmail).toMatch(/^[a-z]+@artifacts\.space$/);
  });

  it("should put the full address on one line", () => {
    expect(postalAddress()).toBe("6651 Rivers Ave, North Charleston, SC 29406");
  });

  it("should encode the subject when a mailto link has one", () => {
    expect(mailtoHref("legal@artifacts.space", "DMCA notice")).toBe("mailto:legal@artifacts.space?subject=DMCA%20notice");
    expect(mailtoHref("privacy@artifacts.space")).toBe("mailto:privacy@artifacts.space");
  });
});
