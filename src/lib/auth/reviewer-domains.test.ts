import { describe, expect, it } from "vitest";

import { emailDomain, isReviewerDomainEmail, reviewerEmailDomains } from "./reviewer-domains";

describe("isReviewerDomainEmail", () => {
  it("should count only the site's own domain in production", () => {
    expect(reviewerEmailDomains).toEqual(["artifacts.space"]);
    expect(isReviewerDomainEmail("Reviewer@Artifacts.Space ", false)).toBe(true);
    expect(isReviewerDomainEmail("reviewer@example.com", false)).toBe(false);
  });

  it("should count the test domain only when it is allowed", () => {
    expect(isReviewerDomainEmail("reviewer@example.com", true)).toBe(true);
  });

  it.each(["reviewer@mail.artifacts.space", "reviewer@artifacts.space.evil.example", "reviewer@notartifacts.space", "reviewer@artifacts.spac", "@artifacts.space", "reviewer@", "reviewer"])(
    "should not count %s",
    (email) => {
      expect(isReviewerDomainEmail(email, true)).toBe(false);
    },
  );
});

describe("emailDomain", () => {
  it("should return the lowercased domain after the last @", () => {
    expect(emailDomain(" A@B@Example.COM ")).toBe("example.com");
    expect(emailDomain("nobody")).toBeNull();
  });
});
