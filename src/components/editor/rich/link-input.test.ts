import { describe, expect, it } from "vitest";

import { readLinkInput } from "./link-input";

describe("readLinkInput", () => {
  it("should remove the link when the field is empty", () => {
    expect(readLinkInput("   ")).toEqual({ kind: "remove" });
  });

  it("should keep an https link when one is typed", () => {
    expect(readLinkInput("https://example.com/a?b=1")).toEqual({ kind: "link", href: "https://example.com/a?b=1" });
  });

  it("should add https when a bare domain is typed", () => {
    expect(readLinkInput("example.com/docs")).toEqual({ kind: "link", href: "https://example.com/docs" });
  });

  it("should add https when a domain with a port is typed", () => {
    expect(readLinkInput("localhost:3000/x")).toEqual({ kind: "link", href: "https://localhost:3000/x" });
  });

  it("should add mailto when an email address is typed", () => {
    expect(readLinkInput("team@example.com")).toEqual({ kind: "link", href: "mailto:team@example.com" });
  });

  it.each(["javascript:alert(1)", "JavaScript:alert(1)", "java\tscript:alert(1)", "data:text/html,<b>x</b>", "vbscript:msgbox(1)", "file:///etc/passwd"])(
    "should refuse the link when it is unsafe: %s",
    (input) => {
      expect(readLinkInput(input)).toEqual({ kind: "invalid" });
    },
  );
});
