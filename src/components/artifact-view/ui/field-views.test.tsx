import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { uiComponentNames } from "@/lib/ui/catalog";
import { componentFixtures, fixtureSpec } from "@/lib/ui/fixtures/components";
import { signInSpec } from "@/lib/ui/fixtures/fields";
import { textFields } from "@/lib/ui/validate-fields";

import { ArtifactView } from "../artifact-view";

import { BadgeView, ListView } from "./content";
import { fieldSkipProps } from "./fields";
import { ButtonView } from "./inputs";
import { AvatarView, initialsOf } from "./screen";

const emit = () => undefined;

function page(spec: unknown): string {
  return renderToStaticMarkup(<ArtifactView kind="ui" content={JSON.stringify(spec)} title="Test" />);
}

function one(type: string, props: Record<string, unknown>, state: Record<string, unknown> = {}): string {
  return page({ version: 1, root: "e", state, elements: { e: { type, props } } });
}

/** Every real text control in the markup: its whole opening tag. */
function controls(html: string): string[] {
  return html.match(/<(input|textarea)\b[^>]*>/g) ?? [];
}

/** Kinds of `<input>` a reader cannot type text into. */
const notTyped = new Set(["checkbox", "radio", "range", "hidden", "button", "submit", "reset", "file", "color", "image"]);

/**
 * True for a control kept out of a reader's reach: out of the tab order and
 * hidden from assistive technology. That is the input a Select, a Checkbox,
 * or a Switch keeps under its own control to carry its value; a reader
 * never types in it. It is told by those two marks, whatever its tag, so a
 * field that is only hidden from assistive technology still counts.
 */
function outOfReach(control: string): boolean {
  return control.includes('aria-hidden="true"') && control.includes('tabindex="-1"');
}

/** True for a control a reader can type free text into: a text area, or an input of a typed kind, within the reader's reach. */
function takesTypedText(control: string): boolean {
  if (outOfReach(control)) return false;
  if (control.startsWith("<textarea")) return true;
  return !notTyped.has(/\stype="([^"]*)"/.exec(control)?.[1] ?? "text");
}

/** A region a reader can type in that is not an input or a text area. */
const editableRegion = /\scontenteditable="(?:true|plaintext-only|)"/;

/** True when the markup holds any field a reader types in: a typed control or an editable region. */
function drawsTypedText(html: string): boolean {
  return editableRegion.test(html) || controls(html).some(takesTypedText);
}

/**
 * Every catalog component that draws a field a reader types in. It sees
 * what the gallery fixtures draw and no more: a component that draws a
 * field only for props no fixture sets is missed, so a new kind of field
 * needs a fixture that shows it. Every component has at least one fixture;
 * the test beside the guard checks that.
 */
function componentsWithTypedText(): string[] {
  return uiComponentNames.filter((name) => componentFixtures[name].some((fixture) => drawsTypedText(page(fixtureSpec(name, fixture)))));
}

const skipAttributes = ['autoComplete="off"', 'data-1p-ignore=""', 'data-lpignore="true"', 'data-bwignore=""', 'data-form-type="other"'];

describe("password stand-in", () => {
  it("should draw dots and no editable field when an Input is a password", () => {
    const html = one("Input", { label: "Password", type: "password" });
    expect(controls(html)).toEqual([]);
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("contenteditable");
    expect(html).not.toContain("tabindex");
    expect(html).toContain("data-password-stand-in");
    expect(html).toContain('role="img"');
    expect(html).toContain("It cannot be typed into.");
  });

  it("should name the stand-in by its label once, and describe it, instead of repeating the label in the name", () => {
    const html = one("Input", { label: "Password", type: "password", description: "At least 12 characters." });
    expect(html).not.toContain("aria-label=");
    const labelId = /aria-labelledby="([^"]+)"/.exec(html)?.[1] ?? "missing";
    expect(html).toMatch(new RegExp(`<span[^>]*id="${labelId}"[^>]*aria-hidden="true"[^>]*>Password</span>`));
    const described = /aria-describedby="([^"]+)"/.exec(html)?.[1]?.split(" ") ?? [];
    expect(described).toHaveLength(2);
    for (const id of described) expect(html).toContain(`id="${id}"`);
    // What it is reads as its description only: the text itself is hidden.
    expect(html).toMatch(/<span[^>]*hidden=""[^>]*>A password field in a mockup\. It cannot be typed into\.<\/span>/);
    expect(html).not.toContain("data-disabled");
  });

  it("should dim a disabled stand-in and say it is disabled in its description", () => {
    const html = one("Input", { label: "Password", type: "password", disabled: true });
    expect(html).toContain("A disabled password field in a mockup.");
    // An image takes no disabled state, so the words carry it.
    expect(html).not.toContain("aria-disabled");
    expect(html).toContain("opacity-50");
    expect(controls(html)).toEqual([]);
  });

  it("should show a notice in place of the field, with no editable field, when a password Input is given a binding", () => {
    const html = one("Input", { label: "Password", type: "password", value: { $bindState: "/secret" } }, { secret: "" });
    // The rule's own words: without the rule the stand-in would draw and this notice would not.
    expect(html).toContain("A password Input is a stand-in that cannot be typed into: it takes no `value` and cannot be bound with `$bindState`.");
    expect(html).toContain("1 part of this interface could not be shown.");
    expect(html).not.toContain("data-password-stand-in");
    expect(controls(html)).toEqual([]);
    expect(html).not.toContain('type="password"');
  });

  it("should refuse a password Input with a written value the same way", () => {
    const html = one("Input", { label: "Password", type: "password", value: "hunter2" });
    expect(html).toContain("A password Input is a stand-in that cannot be typed into");
    expect(html).not.toContain("data-password-stand-in");
    expect(html).not.toContain("hunter2");
    expect(controls(html)).toEqual([]);
  });

  it("should never render a password input anywhere in the sign-in screen", () => {
    const html = page(signInSpec);
    expect(html).not.toContain('type="password"');
    expect(controls(html)).toHaveLength(1);
    expect(controls(html)[0]).toContain('type="email"');
    expect(html).toContain("data-password-stand-in");
  });
});

describe("text fields", () => {
  it("should carry every skip attribute password managers honor, by the same names the browser reads", () => {
    expect(Object.keys(fieldSkipProps).sort()).toEqual(["autoComplete", "data-1p-ignore", "data-bwignore", "data-form-type", "data-lpignore"]);
  });

  it.each(["Input", "Textarea"] as const)("should put the skip attributes and no name on every %s fixture, with no form around it", (type) => {
    for (const fixture of componentFixtures[type]) {
      const html = page(fixtureSpec(type, fixture));
      expect(html, fixture.name).not.toContain("<form");
      for (const control of controls(html)) {
        for (const attribute of skipAttributes) expect(control.toLowerCase(), `${fixture.name}: ${attribute}`).toContain(attribute.toLowerCase());
        expect(control, fixture.name).not.toMatch(/\sname=/);
      }
      const drawn = fixture.props.type === "password" ? 0 : 1;
      expect(controls(html), fixture.name).toHaveLength(drawn);
    }
  });

  it("should tie the description and the error to the field and mark it invalid when an error is set", () => {
    const html = one("Input", { label: "Email", description: "Work address.", error: "Enter a full address." });
    const control = controls(html)[0] ?? "";
    expect(control).toContain('aria-invalid="true"');
    const described = /aria-describedby="([^"]+)"/.exec(control)?.[1]?.split(" ") ?? [];
    expect(described).toHaveLength(2);
    for (const id of described) expect(html).toContain(`id="${id}"`);
  });

  it("should give a Textarea its rows as the least height it shows", () => {
    expect(controls(one("Textarea", { label: "Notes", rows: 6 }))[0]).toContain("--textarea-rows:6");
    expect(controls(one("Textarea", { label: "Notes" }))[0]).toContain("--textarea-rows:3");
    // The height rule is the shared field's own, so it is in one place.
    expect(controls(one("Textarea", { label: "Notes", rows: 6 }))[0]).toContain("min-h-[calc(var(--textarea-rows)*1lh");
  });

  it("should keep the label for screen readers only when hideLabel is set", () => {
    const html = one("Textarea", { label: "Message", hideLabel: true });
    expect(html).toMatch(/<label [^>]*class="[^"]*sr-only[^"]*"[^>]*>Message<\/label>/);
  });

  it("should show the bound state as the value when an Input is bound", () => {
    const html = one("Input", { label: "Name", value: { $bindState: "/name" } }, { name: "Maya" });
    expect(controls(html)[0]).toContain('value="Maya"');
  });

  it("should stop the page, showing no field, when typed text could reach a link", () => {
    const html = page({ version: 1, root: "page", state: { q: "" }, elements: { page: { type: "Stack", props: {}, children: ["field", "go"] }, field: { type: "Input", props: { label: "Search", value: { $bindState: "/q" } } }, go: { type: "Link", props: { label: "Go", href: { $template: "https://example.com/?q=${/q}" } } } } });
    expect(controls(html)).toEqual([]);
    expect(html).not.toContain("<a ");
  });

  it("should mark a Select invalid and disabled when it has an error and is disabled", () => {
    const html = one("Select", { label: "Region", options: ["Europe"], error: "Choose a region.", disabled: true });
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Choose a region.");
    expect(html).toMatch(/disabled/);
  });
});

describe("the typed-text rule's list of text fields", () => {
  it("should have a gallery fixture for every catalog component, so none can skip the guard by drawing nothing", () => {
    // Nothing else fails for an empty list: the tests that run over fixtures only get fewer cases.
    const without = uiComponentNames.filter((name) => componentFixtures[name].length === 0);
    expect(without, "Give each of these a fixture in src/lib/ui/fixtures: the typed-text guard reads what fixtures draw").toEqual([]);
  });

  it("should list every catalog component that draws a field a reader types in, so a new one cannot be missed", () => {
    // Read from what each component draws in its gallery fixtures, not from a second list.
    expect(
      componentsWithTypedText().sort(),
      "A component draws a field a reader types in (an input, a text area, or an editable region) and is not in `textFields`, or is listed and draws none. Keep `textFields` in src/lib/ui/validate-fields.ts equal to this list",
    ).toEqual([...textFields].sort());
  });

  // This test owns how a listed field binds what is typed: an editable region, or a field bound through another prop, fails here.
  it.each([...textFields])("should show state in a %s through `value`, the prop the rule reads for a binding", (type) => {
    const html = one(type, { label: "Field", value: { $bindState: "/typed" } }, { typed: "zebra-typed" });
    const shown = controls(html).filter((control) => takesTypedText(control) && (control.includes('value="zebra-typed"') || control.startsWith("<textarea")));
    expect(
      shown,
      `${type} is in \`textFields\`, but no input or text area shows state bound to \`value\`. The typed-text rule reads only \`value\` for a binding: teach \`boundTextFields\` in src/lib/ui/validate-fields.ts the prop this component binds what is typed to, test it there, and then extend this test`,
    ).toHaveLength(1);
    expect(html).toContain("zebra-typed");
  });

  it("should not count a checkbox, a slider, a switch, or the hidden input under a Select as typed text", () => {
    expect(takesTypedText('<input tabindex="-1" type="checkbox" aria-hidden="true"/>')).toBe(false);
    expect(takesTypedText('<input type="range" min="0" max="100"/>')).toBe(false);
    expect(takesTypedText('<input tabindex="-1" aria-hidden="true"/>')).toBe(false);
    expect(takesTypedText('<input data-slot="input"/>')).toBe(true);
    expect(takesTypedText('<input type="search"/>')).toBe(true);
    expect(takesTypedText('<textarea rows="3">')).toBe(true);
  });

  it("should treat an input and a text area the same when they are hidden from assistive technology", () => {
    // Out of reach (the input a Select keeps under itself): neither counts.
    expect(takesTypedText('<textarea tabindex="-1" aria-hidden="true">')).toBe(false);
    expect(takesTypedText('<input tabindex="-1" aria-hidden="true"/>')).toBe(false);
    // Hidden from assistive technology only: a reader can still click and type, so both count.
    expect(takesTypedText('<textarea aria-hidden="true">')).toBe(true);
    expect(takesTypedText('<input aria-hidden="true"/>')).toBe(true);
  });

  it("should count an editable region as a field a reader types in, and not a region that is switched off", () => {
    expect(drawsTypedText('<div contenteditable="true"></div>')).toBe(true);
    expect(drawsTypedText('<div contenteditable="plaintext-only"></div>')).toBe(true);
    expect(drawsTypedText('<div contenteditable="false"></div>')).toBe(false);
    expect(drawsTypedText("<p>No field here.</p>")).toBe(false);
  });
});

describe("screen props on Button, Badge, List, and Avatar", () => {
  it("should name an icon-only Button by its label and show no words", () => {
    const html = renderToStaticMarkup(<ButtonView props={{ label: "Open menu", icon: "menu-2", iconOnly: true }} emit={emit} />);
    expect(html).toContain('aria-label="Open menu"');
    expect(html).not.toContain(">Open menu<");
    expect(html).toContain("<svg");
  });

  it("should stretch a full-width Button and disable a disabled one", () => {
    expect(renderToStaticMarkup(<ButtonView props={{ label: "Continue", fullWidth: true }} emit={emit} />)).toContain("w-full");
    expect(renderToStaticMarkup(<ButtonView props={{ label: "Sold out", disabled: true }} emit={emit} />)).toMatch(/<button[^>]* disabled=""/);
  });

  it("should fill a solid Badge with its tone and write it in the page color", () => {
    const html = renderToStaticMarkup(<BadgeView props={{ label: "New", tone: "info", variant: "solid", icon: "check" }} emit={emit} />);
    expect(html).toContain("bg-tone-info");
    expect(html).toContain("text-background");
    expect(html).toContain("<svg");
  });

  it("should draw a hidden mark before each item when a List has a marker", () => {
    const html = renderToStaticMarkup(<ListView props={{ items: ["One", "Two"], marker: "check" }} emit={emit} />);
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("<ul");
    expect(html.match(/<li/g)).toHaveLength(2);
  });

  it("should show the initials of the first two words and announce the whole name", () => {
    expect(initialsOf("Maya Chen")).toBe("MC");
    expect(initialsOf("Tomás de la Cruz")).toBe("TD");
    expect(initialsOf("priya")).toBe("P");
    expect(initialsOf("— —")).toBe("");
    const html = renderToStaticMarkup(<AvatarView props={{ name: "Maya Chen" }} emit={emit} />);
    expect(html).toContain('aria-label="Maya Chen"');
    expect(html).toContain(">MC<");
    expect(html).not.toContain("<img");
  });
});
