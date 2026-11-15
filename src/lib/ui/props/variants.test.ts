import { describe, expect, it } from "vitest";

import { validateUiSpec } from "../validate";

/*
 * Props added to components that were already in the catalog: how a row
 * looks once it has stacked, text that is announced, the danger Button, the
 * check column, the plain Metric, the vertical Separator, the full-width
 * Select, the Placeholder frames, and the toggleState action.
 */

function issues(type: string, props: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return validateUiSpec({ version: 1, root: "e", state: { open: false }, elements: { e: { type, props, ...extra } } }).issues.filter((issue) => issue.severity === "error");
}

const messages = (type: string, props: Record<string, unknown>, extra: Record<string, unknown> = {}) => issues(type, props, extra).map((issue) => issue.message);

describe("a row once it has stacked", () => {
  it("should accept alignBelow and reverseBelow on a horizontal Box with stackBelow", () => {
    expect(messages("Box", { direction: "horizontal", stackBelow: "md", align: "center", alignBelow: "stretch", reverseBelow: true })).toEqual([]);
  });

  it.each(["start", "center", "end", "stretch"])("should accept alignBelow %s", (alignBelow) => {
    expect(messages("Box", { direction: "horizontal", stackBelow: "sm", alignBelow })).toEqual([]);
  });

  it("should say what alignBelow needs when the Box is not a row that stacks", () => {
    const expected = '`alignBelow` only applies to a row that stacks: a Box with `direction: "horizontal"` and `stackBelow`. Set both, or remove `alignBelow`.';
    expect(messages("Box", { alignBelow: "stretch" })).toEqual([expect.stringContaining(expected)]);
    expect(messages("Box", { direction: "horizontal", alignBelow: "stretch" })).toEqual([expect.stringContaining(expected)]);
  });

  it("should say what reverseBelow needs, and nothing when it is false", () => {
    expect(messages("Box", { direction: "horizontal", reverseBelow: true }).join("\n")).toContain("`reverseBelow` only applies to a row that stacks");
    expect(messages("Box", { direction: "horizontal", reverseBelow: false })).toEqual([]);
  });

  it("should report both props, and the stackBelow problem, in one pass when stackBelow sits on a vertical Box", () => {
    const found = messages("Box", { stackBelow: "md", alignBelow: "center", reverseBelow: true }).join("\n");
    expect(found).toContain("`stackBelow` only applies to a Box with");
    expect(found).toContain("`alignBelow` only applies to a row that stacks");
    expect(found).toContain("`reverseBelow` only applies to a row that stacks");
  });

  it("should refuse a value that is not an alignment, beside any other problem", () => {
    const found = messages("Box", { direction: "horizontal", stackBelow: "md", alignBelow: "middle", padding: "12px" }).join("\n");
    expect(found).toContain("alignBelow");
    expect(found).toContain("padding");
  });
});

describe("variants and formats", () => {
  it("should accept the danger Button and refuse a variant that is not in the list", () => {
    expect(messages("Button", { label: "Delete", variant: "danger" })).toEqual([]);
    expect(messages("Button", { label: "Delete", variant: "destructive" })).not.toEqual([]);
  });

  it("should accept announce on Text and Callout, as a boolean only", () => {
    expect(messages("Text", { text: "Thanks.", announce: true })).toEqual([]);
    expect(messages("Callout", { text: "Saved.", announce: true })).toEqual([]);
    expect(messages("Text", { text: "Thanks.", announce: "polite" })).not.toEqual([]);
  });

  it("should accept the check format on a Table column and keep it off a KeyValue item", () => {
    expect(messages("Table", { columns: [{ key: "ok", label: "OK", format: "check" }], rows: [{ ok: true }, { ok: false }, { ok: null }, { ok: "Soon" }] })).toEqual([]);
    expect(messages("KeyValue", { items: [{ label: "OK", value: true, format: "check" }] })).not.toEqual([]);
  });

  it("should accept a plain Metric and refuse another variant", () => {
    expect(messages("Metric", { label: "Teams", value: 12, variant: "plain" })).toEqual([]);
    expect(messages("Metric", { label: "Teams", value: 12, variant: "bare" })).not.toEqual([]);
  });

  it("should accept a vertical Separator, and say a label needs a horizontal one", () => {
    expect(messages("Separator", { orientation: "vertical" })).toEqual([]);
    expect(messages("Separator", { orientation: "horizontal", label: "Appendix" })).toEqual([]);
    expect(messages("Separator", { orientation: "vertical", label: "Appendix" })).toEqual([expect.stringContaining('`label` applies to a horizontal Separator. Remove `label`, or remove `orientation: "vertical"`.')]);
  });

  it("should accept fullWidth on a Select", () => {
    expect(messages("Select", { label: "Country", options: ["Canada"], fullWidth: true })).toEqual([]);
  });

  it("should accept a frame on a picture-sized Placeholder and say why a logo or an avatar takes none", () => {
    expect(messages("Placeholder", { frame: "browser" })).toEqual([]);
    expect(messages("Placeholder", { frame: "phone", variant: "video", ratio: "portrait" })).toEqual([]);
    expect(messages("Placeholder", { frame: "none", variant: "logo" })).toEqual([]);
    expect(messages("Placeholder", { frame: "phone", variant: "avatar" })).toEqual([expect.stringContaining('`frame` applies to an image, video, or map Placeholder. Remove `frame`, or change `variant: "avatar"`.')]);
    expect(messages("Placeholder", { frame: "tablet" })).not.toEqual([]);
  });

  it("should say nothing about frame when variant is an expression", () => {
    const shape = { $cond: { $state: "/open" }, $then: "logo", $else: "image" };
    expect(messages("Placeholder", { variant: shape, frame: "browser" })).toEqual([]);
    expect(messages("Placeholder", { variant: { $state: "/open" }, frame: "phone" })).toEqual([]);
    // And nothing when the frame is the expression: it is only known once it resolves.
    expect(messages("Placeholder", { variant: "logo", frame: { $cond: { $state: "/open" }, $then: "browser", $else: "none" } })).toEqual([]);
  });
});

describe("the toggleState action", () => {
  const press = (action: string, params: Record<string, unknown>) => issues("Button", { label: "Details" }, { on: { press: { action, params } } });

  it("should be an action a Button may run", () => {
    expect(press("toggleState", { statePath: "/open" })).toEqual([]);
  });

  it("should still refuse an action that is not a state action, and name toggleState among the ones allowed", () => {
    const found = press("navigate", { to: "https://example.com" });
    expect(found.map((issue) => issue.code)).toEqual(["invalid_action"]);
    expect(found[0]?.message).toContain("toggleState");
  });

  it("should leave the typed-text rule as strict as it was: a spec with a bound text field and a toggle still may not build a link from state", () => {
    const elements = {
      page: { type: "Stack", props: {}, children: ["field", "toggle", "go"] },
      field: { type: "Input", props: { label: "Name", value: { $bindState: "/name" } } },
      toggle: { type: "Button", props: { label: "Details" }, on: { press: { action: "toggleState", params: { statePath: "/open" } } } },
      go: { type: "Link", props: { label: "Go", href: { $state: "/url" } } },
    };
    const codes = (spec: unknown) => validateUiSpec(spec).issues.filter((issue) => issue.severity === "error").map((issue) => issue.code);
    expect(codes({ version: 1, root: "page", state: { name: "", open: false, url: "https://example.com" }, elements })).toEqual(["typed_text_in_link"]);
    const written = { ...elements, go: { type: "Link", props: { label: "Go", href: "https://example.com" } } };
    expect(codes({ version: 1, root: "page", state: { name: "", open: false }, elements: written })).toEqual([]);
  });

  it("should refuse a statePath that could reach an object's prototype, as for every state action", () => {
    const result = validateUiSpec({ version: 1, root: "e", elements: { e: { type: "Button", props: { label: "Go" }, on: { press: { action: "toggleState", params: { statePath: "/__proto__/open" } } } } } });
    expect(result.renderable).toBe(false);
  });
});

describe("Button expanded", () => {
  it("should accept expanded as true, false, or read from state", () => {
    expect(messages("Button", { label: "Menu", expanded: true })).toEqual([]);
    expect(messages("Button", { label: "Menu", expanded: { $state: "/open" } })).toEqual([]);
    expect(messages("Button", { label: "Menu", expanded: "yes" })).not.toEqual([]);
  });
});

describe("Link icon", () => {
  const endIcon = 'An inline link with an `href` ends with its own arrow, so its icon goes at the start.';

  it("should accept an icon at the start of any link, and at the end of one with no arrow", () => {
    expect(messages("Link", { label: "Docs", icon: "book", href: "https://example.com" })).toEqual([]);
    expect(messages("Link", { label: "Docs", icon: "arrow-right", iconPosition: "end" })).toEqual([]);
    expect(messages("Link", { label: "Docs", icon: "arrow-right", iconPosition: "end", variant: "nav", href: "https://example.com" })).toEqual([]);
  });

  it("should refuse an icon at the end of an inline link with an href, written or read from state", () => {
    expect(messages("Link", { label: "Docs", icon: "arrow-right", iconPosition: "end", href: "https://example.com" })).toEqual([expect.stringContaining(endIcon)]);
    expect(messages("Link", { label: "Docs", icon: "arrow-right", iconPosition: "end", variant: "inline", href: { $state: "/url" } })).toEqual([expect.stringContaining(endIcon)]);
  });

  it("should say nothing about the side when the link has no icon", () => {
    expect(messages("Link", { label: "Docs", iconPosition: "end", href: "https://example.com" })).toEqual([]);
  });

  it("should say nothing about the icon's side when the href is one the link policy refuses, which draws no arrow", () => {
    for (const href of ["#top", ""]) {
      expect(messages("Link", { label: "Docs", icon: "arrow-right", iconPosition: "end", href }).join(" ")).not.toContain(endIcon);
    }
  });

  it("should say nothing about the icon while the variant or the position is an expression", () => {
    expect(messages("Link", { label: "Docs", icon: "arrow-right", iconPosition: { $state: "/side" }, href: "https://example.com" })).toEqual([]);
    expect(messages("Link", { label: "Docs", icon: "arrow-right", iconPosition: "end", variant: { $state: "/kind" }, href: "https://example.com" })).toEqual([]);
  });

  it("should refuse an icon name that is not in the list", () => {
    expect(messages("Link", { label: "Docs", icon: "not-an-icon" })).not.toEqual([]);
  });
});
