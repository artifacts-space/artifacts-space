import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { pressedHoverMix } from "@/lib/themes/derive";
import { pressedToggleSpec } from "@/lib/ui/fixtures/fields";

import { ArtifactView } from "../artifact-view";

import { BadgeView, TextView } from "./content";
import { ButtonView } from "./inputs";
import { IconView } from "./screen";
import type { ViewProps } from "./stout";

/*
 * Button `pressed`, which tells screen readers a toggle is on and shows it,
 * and the accent tone on Text, Icon, and Badge.
 */

const emit = () => undefined;

function page(spec: unknown): string {
  return renderToStaticMarkup(<ArtifactView kind="ui" content={JSON.stringify(spec)} title="Test" />);
}

/** The opening tag of the first button in the markup. */
const buttonTag = (html: string) => /<button\b[^>]*>/.exec(html)?.[0] ?? "";
const classesOf = (html: string) => /class="([^"]*)"/.exec(html)?.[1]?.split(" ") ?? [];
const button = (props: ViewProps<"Button">["props"]) => renderToStaticMarkup(<ButtonView props={props} emit={emit} />);

describe("a Button that says whether it is on", () => {
  it("should set aria-pressed from pressed when it is written as true or false", () => {
    expect(buttonTag(button({ label: "Bold", pressed: true }))).toContain('aria-pressed="true"');
    expect(buttonTag(button({ label: "Bold", pressed: false }))).toContain('aria-pressed="false"');
  });

  it("should set aria-pressed from state when pressed reads the path the button flips", () => {
    expect(buttonTag(page({ ...pressedToggleSpec, state: { bold: false } }))).toContain('aria-pressed="false"');
    expect(buttonTag(page({ ...pressedToggleSpec, state: { bold: true } }))).toContain('aria-pressed="true"');
  });

  it("should show a notice instead of the button when the state pressed reads holds a string", () => {
    const html = page({ ...pressedToggleSpec, state: { bold: "yes" } });
    expect(html).toContain("This Button could not be shown.");
    expect(html).not.toContain("aria-pressed");
  });

  it("should write aria-pressed only as true or false when a string reaches the view", () => {
    // State can hold any JSON; the renderer refuses this before the view, and the view holds the line on its own too.
    const props = { label: "Bold", pressed: "yes" } as unknown as ViewProps<"Button">["props"];
    expect(buttonTag(button(props))).toContain('aria-pressed="false"');
  });

  it("should leave aria-pressed off a button without pressed", () => {
    expect(buttonTag(button({ label: "Save" }))).not.toContain("aria-pressed");
  });
});

describe("the pressed look", () => {
  it.each(["default", "outline", "secondary", "ghost"] as const)("should fill a pressed %s Button with the text color, write its label in the page color, and draw the inner line", (variant) => {
    const classes = classesOf(button({ label: "Bold", variant, pressed: true }));
    for (const name of ["bg-foreground", "text-background", "border-foreground", "outline-solid", "outline-background", "-outline-offset-3", "dark:bg-foreground", "dark:border-foreground"]) expect(classes, name).toContain(name);
    // The variant's own fills and words under the pointer give way to the pressed ones.
    for (const name of ["bg-primary", "hover:bg-primary/80", "hover:bg-muted", "hover:text-foreground", "bg-secondary", "outline-none", "dark:bg-input/30", "dark:hover:bg-input/50", "dark:hover:bg-muted/50"]) expect(classes, name).not.toContain(name);
  });

  it("should move a pressed Button's fill toward its label under the pointer, by the step the theme rule checks", () => {
    const step = `_${String(Math.round(pressedHoverMix * 100))}%)]`;
    const classes = classesOf(button({ label: "Bold", variant: "outline", pressed: true }));
    expect(classes).toContain(`hover:bg-[color-mix(in_oklch,var(--foreground),var(--background)${step}`);
    expect(classes).toContain(`dark:hover:bg-[color-mix(in_oklch,var(--foreground),var(--background)${step}`);
  });

  it("should draw a Button that is not pressed as its variant draws it at rest", () => {
    const off = classesOf(button({ label: "Bold", variant: "outline", pressed: false }));
    expect(off).toContain("border-border");
    expect(off).not.toContain("bg-foreground");
    expect(classesOf(button({ label: "Bold", variant: "outline" }))).toEqual(off);
  });

  it("should keep the danger fill on a danger Button that reaches the view with pressed, which validation refuses", () => {
    const classes = classesOf(button({ label: "Delete", variant: "danger", pressed: true }));
    expect(classes).toContain("bg-tone-danger");
    expect(classes).not.toContain("bg-foreground");
  });
});

describe("the accent tone", () => {
  it("should color Text and an Icon with the accent tone", () => {
    expect(classesOf(renderToStaticMarkup(<TextView props={{ text: "New", tone: "accent" }} emit={emit} />))).toContain("text-tone-accent");
    expect(renderToStaticMarkup(<IconView props={{ name: "star", tone: "accent" }} emit={emit} />)).toContain("text-tone-accent");
  });

  it("should draw an accent Badge as each variant draws a status tone: a tint, a fill under the page color, and an edge", () => {
    const badge = (variant: "soft" | "solid" | "outline") => classesOf(renderToStaticMarkup(<BadgeView props={{ label: "New", tone: "accent", variant }} emit={emit} />));
    expect(badge("soft")).toEqual(expect.arrayContaining(["bg-tone-accent/10", "text-tone-accent", "border-tone-accent/30"]));
    expect(badge("solid")).toEqual(expect.arrayContaining(["bg-tone-accent", "text-background"]));
    expect(badge("outline")).toEqual(expect.arrayContaining(["border-tone-accent/40", "text-tone-accent"]));
  });
});
