import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { componentFixtures, fixtureSpec } from "@/lib/ui/fixtures/components";
import { signInSpec } from "@/lib/ui/fixtures/fields";

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

  it("should show a notice in place of the field, with no editable field, when a password Input is given a binding", () => {
    const html = one("Input", { label: "Password", type: "password", value: { $bindState: "/secret" } }, { secret: "" });
    expect(controls(html)).toEqual([]);
    expect(html).not.toContain('type="password"');
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
