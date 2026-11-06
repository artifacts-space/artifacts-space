import { describe, expect, it } from "vitest";

import { isSafeHref, safeHref } from "./link-policy";

describe("safeHref", () => {
  it("should allow http, https, and mailto links when they are absolute", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeHref("http://example.com")).toBe("http://example.com/");
    expect(safeHref("mailto:team@example.com")).toBe("mailto:team@example.com");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "/relative/path",
    "//example.com",
    "#anchor",
    "",
    "https://user:pass@example.com",
    "https://",
  ])("should reject %j when it is not an allowed absolute link", (href) => {
    expect(safeHref(href)).toBeNull();
  });

  it("should reject non-strings and overlong URLs when given", () => {
    expect(safeHref(42)).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(isSafeHref(`https://example.com/${"a".repeat(3000)}`)).toBe(false);
  });
});
