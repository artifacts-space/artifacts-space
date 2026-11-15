import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { presetTheme, siteDefaultTheme } from "@/lib/themes/resolve";
import { uiIconNames } from "@/lib/ui/icon-names";

import { ArtifactView } from "../artifact-view";
import { ThemeScope } from "../theme-scope";

import { BoxView } from "./box";
import { HeadingView, LinkView, TextView } from "./content";
import { uiIconComponents } from "./icon-glyphs";
import { IconView, PlaceholderView } from "./screen";

const emit = () => undefined;
const ocean = presetTheme("ocean") ?? siteDefaultTheme();

function box(props: Parameters<typeof BoxView>[0]["props"], children: React.ReactNode = "x") {
  return renderToStaticMarkup(<BoxView props={props} emit={emit}>{children}</BoxView>);
}

describe("BoxView", () => {
  it("should lay children out in a row that turns into a column below the named container width when stackBelow is set", () => {
    const html = box({ direction: "horizontal", stackBelow: "md", gap: "lg", justify: "between" });
    expect(html).toContain("flex-col @2xl/ui:flex-row");
    expect(html).toContain("gap-6");
    expect(html).toContain("justify-between");
  });

  it("should hide by the named container, never the window, when hideBelow and hideAbove are set", () => {
    const html = box({ hideBelow: "sm", hideAbove: "lg" });
    expect(html).toContain("hidden @xl/ui:flex");
    expect(html).toContain("@4xl/ui:hidden");
    expect(html).not.toMatch(/\b(sm|md|lg):/);
  });

  it("should be a named group when it has a label, and a plain box without one", () => {
    expect(box({ label: "Site navigation" })).toContain('role="group" aria-label="Site navigation"');
    expect(box({})).not.toContain("role=");
  });

  it("should paint a hue from its token when the surface is a block hue", () => {
    expect(box({ surface: "blue" })).toContain("background-color:var(--block-blue-bg)");
  });

  it("should take the site's other palette when an inverse surface sits outside a themed artifact", () => {
    const html = box({ surface: "inverse" });
    expect(html).toContain("theme-invert");
    expect(html).toContain("bg-background text-foreground");
  });

  it("should flip only once when an inverse or primary surface sits inside another", () => {
    const html = box({ surface: "inverse" }, <BoxView props={{ surface: "primary" }} emit={emit}>x</BoxView>);
    expect(html.match(/theme-invert/g)).toHaveLength(1);
  });

  it("should set the theme's own colors again on an inverse surface inside a themed artifact that follows the reader", () => {
    const html = renderToStaticMarkup(<ThemeScope theme={ocean}><BoxView props={{ surface: "inverse" }} emit={emit}>x</BoxView></ThemeScope>);
    const inner = html.slice(html.indexOf("theme-invert"));
    expect(inner).toContain(`--background:light-dark(${ocean.light.background}, ${ocean.dark.background})`);
  });

  it("should pin the other mode on an inverse surface when the themed artifact pins one", () => {
    const html = renderToStaticMarkup(<ThemeScope theme={ocean} mode="light"><BoxView props={{ surface: "inverse" }} emit={emit}>x</BoxView></ThemeScope>);
    expect(html).toMatch(/class="[^"]*\bdark bg-background text-foreground"/);
    expect(html).toContain(`--background:${ocean.dark.background}`);
  });

  it("should paint the accent and swap button colors on a primary surface of a themed artifact", () => {
    const html = renderToStaticMarkup(<ThemeScope theme={ocean} mode="light"><BoxView props={{ surface: "primary" }} emit={emit}>x</BoxView></ThemeScope>);
    expect(html).toContain(`--background:${ocean.light.accent}`);
    expect(html).toContain(`--primary:${ocean.light.accentForeground}`);
  });
});

describe("IconView and PlaceholderView", () => {
  it("should have a component for every icon name and nothing else", () => {
    expect(Object.keys(uiIconComponents).sort()).toEqual([...uiIconNames].sort());
    for (const component of Object.values(uiIconComponents)) expect(component).toBeTruthy();
  });

  it("should hide a decorative icon from screen readers and name a labelled one as an image", () => {
    expect(renderToStaticMarkup(<IconView props={{ name: "check" }} emit={emit} />)).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(<IconView props={{ name: "star", label: "Rated five stars" }} emit={emit} />);
    expect(labelled).toContain('role="img" aria-label="Rated five stars"');
    expect(labelled).not.toContain("aria-hidden");
  });

  it("should draw a page icon and a screen mark from the one name list", () => {
    expect(renderToStaticMarkup(<IconView props={{ name: "rocket" }} emit={emit} />)).toContain("tabler-icon-rocket");
    expect(renderToStaticMarkup(<IconView props={{ name: "arrow-right" }} emit={emit} />)).toContain("tabler-icon-arrow-right");
  });

  it("should name a placeholder by its label, or by what it stands in for", () => {
    expect(renderToStaticMarkup(<PlaceholderView props={{ label: "Hero image" }} emit={emit} />)).toContain('role="img" aria-label="Hero image"');
    expect(renderToStaticMarkup(<PlaceholderView props={{ variant: "map" }} emit={emit} />)).toContain('aria-label="Map placeholder"');
  });

  it("should keep a logo placeholder a small fixed box unless a ratio is asked for", () => {
    expect(renderToStaticMarkup(<PlaceholderView props={{ variant: "logo" }} emit={emit} />)).toContain("h-8 w-28");
    expect(renderToStaticMarkup(<PlaceholderView props={{ variant: "logo", ratio: "square" }} emit={emit} />)).toContain("aspect-square");
  });
});

describe("screen props on Text, Heading, and Link", () => {
  it("should draw a heading at its size without changing its level", () => {
    const html = renderToStaticMarkup(<HeadingView props={{ text: "Plan", level: 3, size: "display", align: "center" }} emit={emit} />);
    expect(html).toMatch(/^<h3 /);
    expect(html).toContain("text-4xl");
    expect(html).toContain("text-center");
  });

  it("should keep a paragraph's classes as they were when it uses no screen props", () => {
    const html = renderToStaticMarkup(<TextView props={{ text: "Hello", tone: "muted", size: "sm" }} emit={emit} />);
    expect(html).toBe('<p class="whitespace-pre-line max-w-[var(--artifact-measure,72ch)] break-words text-sm leading-6 text-muted-foreground">Hello</p>');
  });

  it("should let size and tone win over a variant's own", () => {
    const html = renderToStaticMarkup(<TextView props={{ text: "Team plan", variant: "eyebrow", size: "sm", tone: "info", clamp: 2 }} emit={emit} />);
    expect(html).toContain("uppercase");
    expect(html).toContain("text-sm");
    expect(html).toContain("text-tone-info");
    expect(html).not.toContain("text-muted-foreground");
    expect(html).toContain("line-clamp-2");
  });

  it("should render plain words, not a link, when a Link has no address", () => {
    const html = renderToStaticMarkup(<LinkView props={{ label: "Docs", variant: "nav", active: true }} emit={emit} />);
    expect(html).not.toContain("<a");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(">Docs</span>");
  });

  it.each(["inline", "nav", "muted"] as const)("should mark the current page on a %s Link when active is set, with and without an address", (variant) => {
    const linked = renderToStaticMarkup(<LinkView props={{ label: "Docs", href: "https://example.com/docs", variant, active: true }} emit={emit} />);
    expect(linked).toMatch(/<a [^>]*aria-current="page"/);
    const plain = renderToStaticMarkup(<LinkView props={{ label: "Docs", variant, active: true }} emit={emit} />);
    expect(plain).toMatch(/<span [^>]*aria-current="page"/);
    expect(plain).not.toContain("<a");
  });

  it("should draw the current page from the Link's own classes, so the editor can draw it without the attribute", () => {
    const classOf = (html: string) => /class="([^"]*)"/.exec(html)?.[1]?.split(" ") ?? [];
    expect(classOf(renderToStaticMarkup(<LinkView props={{ label: "Docs", variant: "nav", active: true }} emit={emit} />))).toContain("underline");
    expect(classOf(renderToStaticMarkup(<LinkView props={{ label: "Docs", variant: "nav" }} emit={emit} />))).not.toContain("underline");
    const muted = classOf(renderToStaticMarkup(<LinkView props={{ label: "Docs", variant: "muted", active: true }} emit={emit} />));
    expect(muted).toContain("font-medium");
    expect(muted).toContain("text-foreground");
    expect(muted).not.toContain("text-muted-foreground");
  });

  it.each(["inline", "nav", "muted"] as const)("should not mark the current page on a %s Link when active is not set, with and without an address", (variant) => {
    const linked = renderToStaticMarkup(<LinkView props={{ label: "Docs", href: "https://example.com/docs", variant }} emit={emit} />);
    const plain = renderToStaticMarkup(<LinkView props={{ label: "Docs", variant }} emit={emit} />);
    expect(linked).toContain("<a ");
    expect(linked).not.toContain("aria-current");
    expect(plain).not.toContain("aria-current");
  });

  it("should open a nav link in a new tab under the same rules as every artifact link", () => {
    const html = renderToStaticMarkup(<LinkView props={{ label: "Pricing", href: "https://example.com/pricing", variant: "nav" }} emit={emit} />);
    expect(html).toContain('href="https://example.com/pricing"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(html).toContain("(opens in a new tab)");
  });
});

describe("an icon name read from repeated state", () => {
  const repeated = (icons: string[]) => JSON.stringify({
    version: 1,
    root: "list",
    state: { features: icons.map((icon, index) => ({ id: String(index), icon })) },
    elements: {
      list: { type: "Box", props: { gap: "sm" }, repeat: { statePath: "/features", key: "id" }, children: ["icon"] },
      icon: { type: "Icon", props: { name: { $item: "icon" } } },
    },
  });

  it("should draw each item's icon when the names are in the list", () => {
    const html = renderToStaticMarkup(<ArtifactView kind="ui" content={repeated(["bolt", "lock"])} title="Test" />);
    expect(html).toContain("tabler-icon-bolt");
    expect(html).toContain("tabler-icon-lock");
    expect(html).not.toContain("could not be shown");
  });

  it("should show a notice in place of one item when its icon name is not in the list", () => {
    const html = renderToStaticMarkup(<ArtifactView kind="ui" content={repeated(["bolt", "unicorn"])} title="Test" />);
    expect(html).toContain("tabler-icon-bolt");
    expect(html).toContain("This Icon could not be shown.");
  });
});
