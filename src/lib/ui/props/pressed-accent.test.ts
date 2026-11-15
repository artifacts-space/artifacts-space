import { describe, expect, it } from "vitest";

import { validateUiSpec } from "../validate";

/*
 * Button `pressed`, which tells screen readers a toggle is on, and the
 * accent tone on Text, Icon, and Badge.
 */

function issues(type: string, props: Record<string, unknown>) {
  return validateUiSpec({ version: 1, root: "e", state: { bold: false, open: false }, elements: { e: { type, props } } }).issues.filter((issue) => issue.severity === "error");
}

const messages = (type: string, props: Record<string, unknown>) => issues(type, props).map((issue) => issue.message);

const bothStates = "`pressed` and `expanded` describe different buttons";
const dangerPressed = "A danger Button is a one-time action that deletes or cannot be undone, so it cannot stay pressed";

describe("Button pressed", () => {
  it("should accept pressed as true, false, or read from state", () => {
    expect(messages("Button", { label: "Bold", pressed: true })).toEqual([]);
    expect(messages("Button", { label: "Bold", pressed: false, variant: "outline" })).toEqual([]);
    expect(messages("Button", { label: "Bold", pressed: { $state: "/bold" }, variant: "ghost" })).toEqual([]);
  });

  it.each(["default", "outline", "secondary", "ghost"])("should accept pressed on the %s variant", (variant) => {
    expect(messages("Button", { label: "Bold", pressed: true, variant })).toEqual([]);
  });

  it("should refuse pressed written as anything but true, false, or an expression", () => {
    expect(messages("Button", { label: "Bold", pressed: "yes" })).not.toEqual([]);
  });

  it("should refuse pressed with expanded, written or read from state, and say to keep one", () => {
    expect(messages("Button", { label: "Menu", pressed: true, expanded: false })).toEqual([expect.stringContaining(bothStates)]);
    expect(messages("Button", { label: "Menu", pressed: { $state: "/bold" }, expanded: { $state: "/open" } })).toEqual([expect.stringContaining(bothStates)]);
    expect(messages("Button", { label: "Menu", pressed: true, expanded: false })[0]).toContain("Keep `pressed` for a toggle, or `expanded` for a button that opens something.");
  });

  it("should refuse pressed on a danger Button, and say why and what to use instead", () => {
    const found = messages("Button", { label: "Delete", variant: "danger", pressed: false });
    expect(found).toEqual([expect.stringContaining(dangerPressed)]);
    expect(found[0]).toContain("Remove `pressed`, or use the default, outline, secondary, or ghost variant for a toggle.");
  });

  it("should report every problem at once when a danger Button also takes expanded and iconOnly without an icon", () => {
    const found = messages("Button", { label: "Delete", variant: "danger", pressed: true, expanded: true, iconOnly: true });
    expect(found).toHaveLength(3);
  });

  it("should say nothing about danger while the variant is an expression", () => {
    expect(messages("Button", { label: "Bold", variant: { $state: "/kind" }, pressed: true })).toEqual([]);
  });
});

describe("the accent tone", () => {
  it("should accept accent on Text, Icon, and every Badge variant", () => {
    expect(messages("Text", { text: "New", tone: "accent" })).toEqual([]);
    expect(messages("Icon", { name: "star", tone: "accent" })).toEqual([]);
    for (const variant of ["soft", "solid", "outline"]) expect(messages("Badge", { label: "New", tone: "accent", variant })).toEqual([]);
  });

  it("should refuse accent on a Callout, which is a status", () => {
    expect(messages("Callout", { text: "Heads up", tone: "accent" })).not.toEqual([]);
  });
});
