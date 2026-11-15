import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactView } from "../artifact-view";

import { LinkView } from "./content";
import { ButtonView } from "./inputs";
import type { ViewProps } from "./stout";

/*
 * Button `expanded`, which tells screen readers whether what a button opens
 * is open, and Link `icon` on each of the ways a link is drawn.
 */

function page(elements: Record<string, unknown>, state: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(<ArtifactView kind="ui" content={JSON.stringify({ version: 1, root: "e", state, elements })} title="Test" />);
}

/** The opening tag of the first button in the markup. */
const buttonTag = (html: string) => /<button\b[^>]*>/.exec(html)?.[0] ?? "";

describe("a Button that says whether what it opens is open", () => {
  const menu = (expanded: unknown) => ({ e: { type: "Button", props: { label: "Open menu", icon: "menu-2", iconOnly: true, expanded }, on: { press: { action: "toggleState", params: { statePath: "/open" } } } } });

  it("should set aria-expanded from expanded when it is written as true or false", () => {
    expect(buttonTag(page(menu(true)))).toContain('aria-expanded="true"');
    expect(buttonTag(page(menu(false)))).toContain('aria-expanded="false"');
  });

  it("should set aria-expanded from state when expanded reads the path the button flips", () => {
    expect(buttonTag(page(menu({ $state: "/open" }), { open: false }))).toContain('aria-expanded="false"');
    expect(buttonTag(page(menu({ $state: "/open" }), { open: true }))).toContain('aria-expanded="true"');
  });

  it("should show a notice instead of the button when the state expanded reads holds a string", () => {
    const html = page(menu({ $state: "/open" }), { open: "yes" });
    expect(html).toContain("This Button could not be shown.");
    expect(html).not.toContain("aria-expanded");
  });

  it("should write aria-expanded only as true or false when a string reaches the view", () => {
    // State can hold any JSON; the renderer refuses this before the view, and the view holds the line on its own too.
    const props = { label: "Open menu", expanded: "yes" } as unknown as ViewProps<"Button">["props"];
    expect(buttonTag(renderToStaticMarkup(<ButtonView props={props} emit={() => undefined} />))).toContain('aria-expanded="false"');
  });

  it("should leave aria-expanded off a button without expanded", () => {
    expect(buttonTag(page({ e: { type: "Button", props: { label: "Save" } } }))).not.toContain("aria-expanded");
  });
});

describe("a Link's icon", () => {
  const link = (props: Record<string, unknown>) => renderToStaticMarkup(<LinkView props={{ label: "Docs", ...props }} emit={() => undefined} />);
  /** The order of the icon, the words, and the leaving-the-page arrow in the markup. */
  const order = (html: string) => [...html.matchAll(/data-link-icon="(start|end)"|>Docs<|tabler-icon-arrow-up-right/g)].map((match) => match[1] ?? (match[0] === ">Docs<" ? "words" : "arrow"));

  it("should draw the icon before or after the words of a link that goes nowhere", () => {
    expect(order(link({ icon: "book" }))).toEqual(["start", "words"]);
    expect(order(link({ icon: "arrow-right", iconPosition: "end", variant: "nav" }))).toEqual(["words", "end"]);
  });

  it("should draw the icon before the words, and the arrow last, on an inline link that leaves the page", () => {
    const html = link({ icon: "book", href: "https://example.com/docs" });
    expect(order(html)).toEqual(["start", "words", "arrow"]);
    expect(html).toContain("(opens in a new tab)");
  });

  it("should draw the icon on either side of a nav or muted link that leaves the page", () => {
    expect(order(link({ icon: "arrow-right", iconPosition: "end", variant: "nav", href: "https://example.com" }))).toEqual(["words", "end"]);
    expect(order(link({ icon: "book", variant: "muted", href: "https://example.com" }))).toEqual(["start", "words"]);
  });

  it("should hide the icon from screen readers, so the label alone names the link", () => {
    expect(link({ icon: "book", href: "https://example.com" })).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-link-icon="start"/);
  });

  it("should draw no icon when the link has none", () => {
    expect(link({ variant: "nav" })).not.toContain("data-link-icon");
  });
});
