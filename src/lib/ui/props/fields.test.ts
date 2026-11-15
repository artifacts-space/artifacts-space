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
