import { describe, expect, it } from "vitest";

import { componentFixtures, fixtureSpec } from "../fixtures/components";
import { signInSpec } from "../fixtures/fields";
import { validateUiSpec } from "../validate";

function spec(type: string, props: Record<string, unknown>) {
  return { version: 1, root: "e", state: { v: "" }, elements: { e: { type, props } } };
}

function messages(type: string, props: Record<string, unknown>) {
  return validateUiSpec(spec(type, props)).issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
}

describe("Input and Textarea props", () => {
  it.each(["text", "email", "search", "number", "password"])("should accept an Input of type %s when it has a label", (type) => {
    expect(messages("Input", { label: "Field", type })).toEqual([]);
  });

  it.each(["otp", "tel", "url", "hidden", "file"])("should refuse an Input of type %s when the type is not in the list", (type) => {
    expect(messages("Input", { label: "Field", type })).not.toEqual([]);
  });

  it("should accept a binding on the value when the Input is a text field", () => {
    expect(messages("Input", { label: "Email", type: "email", value: { $bindState: "/v" } })).toEqual([]);
    expect(messages("Textarea", { label: "Notes", value: { $bindState: "/v" } })).toEqual([]);
  });

  it.each([
    ["a binding", { $bindState: "/v" }],
    ["a state read", { $state: "/v" }],
    ["a written value", "hunter2"],
    ["an empty value", ""],
  ])("should refuse %s on a password Input and say it is a stand-in", (_name, value) => {
    const found = messages("Input", { label: "Password", type: "password", value });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("stand-in that cannot be typed into");
    expect(found[0]).toContain("$bindState");
  });

  it.each([
    ["read from state", { $state: "/v" }],
    ["picked by a condition", { $cond: { $state: "/v" }, $then: "password", $else: "text" }],
  ])("should refuse a type that is %s, so a field can never turn into a password field after typing", (_name, type) => {
    const found = messages("Input", { label: "Secret", type, value: { $bindState: "/v" } });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("`type` must be written in the spec");
  });

  it("should accept an icon by name on any Input, the password stand-in included, and refuse a name not in the list", () => {
    expect(messages("Input", { label: "Search", type: "search", icon: "search" })).toEqual([]);
    expect(messages("Input", { label: "Password", type: "password", icon: "lock" })).toEqual([]);
    expect(messages("Input", { label: "Search", icon: "not-an-icon" })).not.toEqual([]);
  });

  it("should refuse a Textarea with fewer than 2 or more than 12 rows", () => {
    expect(messages("Textarea", { label: "Notes", rows: 1 })).not.toEqual([]);
    expect(messages("Textarea", { label: "Notes", rows: 13 })).not.toEqual([]);
    expect(messages("Textarea", { label: "Notes", rows: 12 })).toEqual([]);
  });

  it("should take a description, an error, a hidden label, and a disabled state on Input, Textarea, and Select", () => {
    const shared = { label: "Field", description: "Help", error: "Wrong", hideLabel: true, disabled: true };
    expect(messages("Input", shared)).toEqual([]);
    expect(messages("Textarea", shared)).toEqual([]);
    expect(messages("Select", { ...shared, options: ["A"] })).toEqual([]);
  });
});

describe("screen props on Button, Badge, List, Image, and Avatar", () => {
  it("should refuse an icon-only Button when it has no icon", () => {
    expect(messages("Button", { label: "Menu", iconOnly: true })).not.toEqual([]);
    expect(messages("Button", { label: "Menu", iconOnly: true, icon: "menu-2" })).toEqual([]);
  });

  it("should refuse a Button icon when the name is not in the icon list", () => {
    expect(messages("Button", { label: "Go", icon: "unicorn" })).not.toEqual([]);
  });

  it("should refuse a marker other than the dot on a numbered List", () => {
    expect(messages("List", { items: ["One"], ordered: true, marker: "check" })).not.toEqual([]);
    expect(messages("List", { items: ["One"], ordered: true, marker: "dot" })).toEqual([]);
    expect(messages("List", { items: ["One"], marker: "check" })).toEqual([]);
  });

  it("should refuse a Badge variant or an Image ratio when it is not a named step", () => {
    expect(messages("Badge", { label: "New", variant: "filled" })).not.toEqual([]);
    expect(messages("Image", { file: "f", alt: "A", ratio: "16/9" })).not.toEqual([]);
  });

  it("should require a name on an Avatar and take no picture", () => {
    expect(messages("Avatar", {})).not.toEqual([]);
    expect(validateUiSpec(spec("Avatar", { name: "Maya Chen", src: "https://example.com/a.png" })).issues.map((issue) => issue.code)).toContain("unknown_prop");
  });
});

describe("every problem at once", () => {
  it("should report the password rule together with another prop's error on an Input", () => {
    const found = messages("Input", { label: "Password", type: "password", value: { $bindState: "/v" }, hideLabel: "yes" });
    expect(found).toHaveLength(2);
    expect(found.join("\n")).toContain("hideLabel");
    expect(found.join("\n")).toContain("stand-in that cannot be typed into");
  });

  it("should report the literal-type rule together with another prop's error on an Input", () => {
    const found = messages("Input", { label: "Field", type: { $state: "/v" }, disabled: "no" });
    expect(found.join("\n")).toContain("disabled");
    expect(found.join("\n")).toContain("`type` must be written in the spec");
  });

  it("should report the icon rule together with an unknown size on a Button", () => {
    const found = messages("Button", { label: "Menu", iconOnly: true, size: "huge" });
    expect(found).toHaveLength(2);
    expect(found.join("\n")).toContain("`iconOnly` needs an `icon`");
  });

  it("should report the marker rule together with an item that is not text on a List", () => {
    const found = messages("List", { items: ["One", 2], ordered: true, marker: "check" });
    expect(found.join("\n")).toContain("`marker` applies to a bulleted list");
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  it("should report typed text reaching a link together with an unrelated invalid prop elsewhere in the spec", () => {
    const issues = validateUiSpec({
      version: 1,
      root: "page",
      state: { q: "" },
      elements: {
        page: { type: "Box", props: { padding: "12px" }, children: ["field", "go"] },
        field: { type: "Input", props: { label: "Search", value: { $bindState: "/q" } } },
        go: { type: "Link", props: { label: "Go", href: { $template: "https://example.com/?q=${/q}" } } },
      },
    }).issues;
    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain("typed_text_in_link");
    expect(issues.some((issue) => issue.elementKey === "page" && issue.message.includes("padding"))).toBe(true);
  });
});

describe("field fixtures", () => {
  it.each(["Input", "Textarea", "Avatar", "Button", "Badge", "List", "Select"] as const)("should pass validation with no issues for every %s fixture", (type) => {
    for (const fixture of componentFixtures[type]) {
      expect(validateUiSpec(fixtureSpec(type, fixture)).issues, `${type}: ${fixture.name}`).toEqual([]);
    }
  });

  it("should pass validation with no issues when the sign-in screen binds its email and draws its password", () => {
    expect(validateUiSpec(signInSpec).issues).toEqual([]);
    expect(signInSpec.elements.password.props).not.toHaveProperty("value");
  });
});
