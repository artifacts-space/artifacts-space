import { boxSurfaces, type BoxSurface } from "../props/screen";

import type { ComponentFixture, FixtureChild } from "./components";

/*
 * Fixtures for the pieces a screen is drawn with. The component fixtures
 * have one level of children, like every other; the two whole specs below
 * nest: every surface with every text tone on it, and a small landing page
 * that shows the set composes.
 */

const text = (value: string, props: Record<string, unknown> = {}): FixtureChild => ({ type: "Text", props: { text: value, ...props } });
const longLabel = "A label at its limit, written out in real words so wrapping and truncation are tested as a reader meets them, not with fill";

export const boxFixtures: ComponentFixture[] = [
  { name: "Row, space between", props: { direction: "horizontal", align: "center", justify: "between", gap: "md", padding: "md", border: "all", radius: "lg" }, children: [{ type: "Heading", props: { text: "Weekly digest", level: 3 } }, { type: "Button", props: { label: "Subscribe" } }] },
  { name: "Card surface", props: { surface: "card", padding: "lg", gap: "sm", border: "all", radius: "xl", shadow: "sm", maxWidth: "sm" }, children: [{ type: "Heading", props: { text: "Starter", level: 3 } }, text("For one person and their agents.", { tone: "muted" }), { type: "Button", props: { label: "Choose Starter", variant: "outline" } }] },
  { name: "Inverse surface", props: { surface: "inverse", padding: "xl", gap: "sm", radius: "lg", align: "center" }, children: [{ type: "Heading", props: { text: "Ship the plan, not the meeting", level: 2, align: "center" } }, text("Everything inside reads on the dark band.", { tone: "muted", align: "center" }), { type: "Button", props: { label: "Get started" } }] },
  { name: "Stacks below md", props: { direction: "horizontal", stackBelow: "md", gap: "lg", align: "center" }, children: [text("A row on a wide page column, a column on a narrow one."), { type: "Placeholder", props: { label: "Product shot" } }] },
  { name: "Hidden below md", props: { hideBelow: "md", padding: "sm", surface: "muted", radius: "md" }, children: [text("Only shown on a wide page column.")] },
  { name: "Hidden above md", props: { hideAbove: "md", padding: "sm", surface: "muted", radius: "md" }, children: [text("Only shown on a narrow page column.")] },
  { name: "Scrolling row", props: { direction: "horizontal", overflow: "scroll", gap: "md", label: "Customer logos" }, children: Array.from({ length: 12 }, (_, index) => ({ type: "Placeholder", props: { variant: "logo", label: `Logo ${index + 1}` } })) },
  { name: "Clips to its radius", props: { overflow: "hidden", radius: "xl", border: "all", maxWidth: "sm" }, children: [{ type: "Placeholder", props: { radius: "none", label: "Cover" } }, text("The image above is cut to the corner.", { size: "sm" })] },
  { name: "Empty", props: {} },
  { name: "Long label", props: { label: longLabel.slice(0, 120), padding: "md", border: "y" }, children: [text("Named for screen readers.")] },
];

export const iconFixtures: ComponentFixture[] = [
  { name: "Default", props: { name: "rocket" } },
  { name: "Small and muted", props: { name: "chevron-right", size: "xs", tone: "muted" } },
  { name: "Extra large, success", props: { name: "circle-check", size: "xl", tone: "success" } },
  { name: "Labelled", props: { name: "star", tone: "warning", label: "Rated five stars" } },
];

export const placeholderFixtures: ComponentFixture[] = [
  { name: "Image", props: { label: "Hero image" } },
  { name: "Video, wide", props: { variant: "video", ratio: "wide", label: "Product tour" } },
  { name: "Map, square", props: { variant: "map", ratio: "square", radius: "xl" } },
  { name: "Logo", props: { variant: "logo", label: "Acme" } },
  { name: "Avatar", props: { variant: "avatar", label: "Maya Chen" } },
  { name: "Long label", props: { ratio: "portrait", label: longLabel.slice(0, 80) } },
];

/** Extra Text, Heading, and Link fixtures for the screen props. */
export const screenTextFixtures: ComponentFixture[] = [
  { name: "Eyebrow", props: { text: "New in November", variant: "eyebrow" } },
  { name: "Caption", props: { text: "Billed yearly. Cancel any time.", variant: "caption" } },
  { name: "Mono", props: { text: "pnpm add artifacts", variant: "mono" } },
  { name: "Price, 4xl semibold", props: { text: "$29", size: "4xl", weight: "semibold" } },
  { name: "Centered, clamped to two lines", props: { text: `${longLabel}. ${longLabel}. ${longLabel}.`, align: "center", clamp: 2 } },
  { name: "Danger tone, end aligned", props: { text: "Payment failed.", tone: "danger", align: "end", size: "xs" } },
];

export const screenHeadingFixtures: ComponentFixture[] = [
  { name: "Display, centered", props: { text: "Plans your whole team can read", level: 1, size: "display", align: "center" } },
  { name: "Level one, small", props: { text: "A top-level heading drawn small", level: 1, size: "sm" } },
  { name: "Level three, extra large", props: { text: "A section heading drawn large", level: 3, size: "2xl" } },
];

export const screenLinkFixtures: ComponentFixture[] = [
  { name: "Nav", props: { label: "Pricing", href: "https://example.com/pricing", variant: "nav" } },
  { name: "Nav, current page, no address", props: { label: "Docs", variant: "nav", active: true } },
  { name: "Muted", props: { label: "Privacy", href: "https://example.com/privacy", variant: "muted" } },
  { name: "Inline, no address", props: { label: "A link that goes nowhere" } },
];

type Elements = Record<string, { type: string; props: Record<string, unknown>; children?: string[] }>;

const tones = ["info", "success", "warning", "danger"] as const;

/** One surface with everything that must read on it: body and muted text, each status tone as text and as an icon, a rule, links, and buttons. */
function surfaceElements(surface: BoxSurface): Elements {
  const id = (part: string) => `${surface}-${part}`;
  // A chart and a diagram draw their own colors, so the surfaces that switch the palette each hold one of both.
  const drawn = surface === "inverse" || surface === "primary";
  const elements: Elements = {
    [id("box")]: { type: "Box", props: { surface, padding: "md", gap: "sm", radius: "lg", border: surface === "none" ? "all" : "none", label: `Surface ${surface}` }, children: [id("body"), id("muted"), id("tones"), id("badges"), id("rule"), id("actions"), ...(drawn ? [id("chart"), id("diagram")] : [])] },
    [id("body")]: { type: "Text", props: { text: `Body text on the ${surface} surface.` } },
    [id("muted")]: { type: "Text", props: { text: "Muted text, for secondary detail.", tone: "muted", size: "sm" } },
    [id("tones")]: { type: "Box", props: { direction: "horizontal", wrap: true, gap: "md", align: "center" }, children: tones.flatMap((tone) => [id(`icon-${tone}`), id(`text-${tone}`)]) },
    [id("badges")]: { type: "Box", props: { direction: "horizontal", wrap: true, gap: "sm", align: "center" }, children: tones.map((tone) => id(`badge-${tone}`)) },
    [id("rule")]: { type: "Separator", props: { label: "Details" } },
    [id("actions")]: { type: "Box", props: { direction: "horizontal", wrap: true, gap: "md", align: "center" }, children: [id("primary"), id("outline"), id("nav"), id("quiet")] },
    [id("primary")]: { type: "Button", props: { label: "Primary" } },
    [id("outline")]: { type: "Button", props: { label: "Outline", variant: "outline" } },
    [id("nav")]: { type: "Link", props: { label: "Nav link", variant: "nav" } },
    [id("quiet")]: { type: "Link", props: { label: "Muted link", variant: "muted" } },
  };
  if (drawn) {
    elements[id("chart")] = { type: "Chart", props: { type: "bar", title: `Orders on the ${surface} surface`, labels: ["Q1", "Q2", "Q3"], series: [{ name: "Online", values: [4, 6, 5] }, { name: "In store", values: [3, 2, 4] }, { name: "Phone", values: [1, 2, 1] }] } };
    elements[id("diagram")] = { type: "Diagram", props: { title: `Flow on the ${surface} surface`, code: "flowchart LR\n  A[Order] --> B[Pack] --> C[Ship]" } };
  }
  for (const tone of tones) {
    elements[id(`icon-${tone}`)] = { type: "Icon", props: { name: "circle-check", size: "sm", tone } };
    elements[id(`text-${tone}`)] = { type: "Text", props: { text: `${tone} text`, tone, size: "sm" } };
    elements[id(`badge-${tone}`)] = { type: "Badge", props: { label: `${tone} badge`, tone } };
  }
  return elements;
}

/** Every Box surface with every text tone and every tone badge on it, and a chart and a diagram on the two that switch the palette, for the contrast scan in light, in dark, and under themes. */
export const surfaceMatrixSpec = {
  version: 1,
  root: "page",
  elements: {
    page: { type: "Box", props: { gap: "md" }, children: boxSurfaces.map((surface) => `${surface}-box`) },
    ...Object.assign({}, ...boxSurfaces.map(surfaceElements)) as Elements,
  },
};

const feature = (key: string, icon: string, title: string, body: string): Elements => ({
  [key]: { type: "Box", props: { gap: "sm", padding: "lg", surface: "card", border: "all", radius: "xl" }, children: [`${key}-icon`, `${key}-title`, `${key}-body`] },
  [`${key}-icon`]: { type: "Icon", props: { name: icon, size: "lg", tone: "info" } },
  [`${key}-title`]: { type: "Heading", props: { text: title, level: 3 } },
  [`${key}-body`]: { type: "Text", props: { text: body, tone: "muted", size: "sm" } },
});

/** A small landing page built only from the catalog: a navbar, a hero, a feature grid, and a footer. */
export const landingPageSpec = {
  version: 1,
  root: "page",
  elements: {
    page: { type: "Box", props: { surface: "page" }, children: ["nav", "hero", "features", "footer"] },
    nav: { type: "Box", props: { direction: "horizontal", align: "center", justify: "between", gap: "md", paddingX: "lg", paddingY: "md", border: "bottom", label: "Site navigation" }, children: ["brand", "nav-links", "nav-cta"] },
    brand: { type: "Box", props: { direction: "horizontal", align: "center", gap: "sm" }, children: ["brand-mark", "brand-name"] },
    "brand-mark": { type: "Icon", props: { name: "stack-2", label: "Northwind" } },
    "brand-name": { type: "Text", props: { text: "Northwind", weight: "semibold" } },
    "nav-links": { type: "Box", props: { direction: "horizontal", gap: "lg", hideBelow: "md" }, children: ["nav-product", "nav-pricing", "nav-docs"] },
    "nav-product": { type: "Link", props: { label: "Product", variant: "nav", active: true } },
    "nav-pricing": { type: "Link", props: { label: "Pricing", variant: "nav" } },
    "nav-docs": { type: "Link", props: { label: "Docs", variant: "nav" } },
    "nav-cta": { type: "Button", props: { label: "Sign in", variant: "outline" } },
    hero: { type: "Box", props: { direction: "horizontal", stackBelow: "md", align: "center", gap: "xl", paddingX: "lg", paddingY: "2xl" }, children: ["hero-copy", "hero-art"] },
    "hero-copy": { type: "Box", props: { grow: true, gap: "md" }, children: ["hero-eyebrow", "hero-title", "hero-lead", "hero-actions"] },
    "hero-eyebrow": { type: "Text", props: { text: "Inventory, without the spreadsheet", variant: "eyebrow" } },
    "hero-title": { type: "Heading", props: { text: "Know what is on every shelf", level: 1, size: "display" } },
    "hero-lead": { type: "Text", props: { text: "Northwind counts stock as it moves, so orders never promise what you do not have.", size: "lg", tone: "muted" } },
    "hero-actions": { type: "Box", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["hero-primary", "hero-secondary"] },
    "hero-primary": { type: "Button", props: { label: "Start free" } },
    "hero-secondary": { type: "Button", props: { label: "See a demo", variant: "ghost" } },
    "hero-art": { type: "Box", props: { grow: true, width: "full" }, children: ["hero-image"] },
    "hero-image": { type: "Placeholder", props: { label: "Dashboard screenshot", ratio: "photo", radius: "xl" } },
    features: { type: "Box", props: { surface: "muted", paddingX: "lg", paddingY: "xl", gap: "lg" }, children: ["features-title", "features-grid"] },
    "features-title": { type: "Heading", props: { text: "Built for the stockroom", level: 2, align: "center" } },
    "features-grid": { type: "Grid", props: { columns: 3 }, children: ["feature-scan", "feature-alerts", "feature-reports"] },
    ...feature("feature-scan", "search", "Scan to count", "Count a shelf with a phone camera."),
    ...feature("feature-alerts", "bell", "Low-stock alerts", "Hear about a shortage before a customer does."),
    ...feature("feature-reports", "chart-bar", "Weekly reports", "See what sold, what sat, and what to reorder."),
    footer: { type: "Box", props: { surface: "inverse", direction: "horizontal", stackBelow: "sm", justify: "between", align: "center", gap: "md", paddingX: "lg", paddingY: "lg" }, children: ["footer-note", "footer-links"] },
    "footer-note": { type: "Text", props: { text: "© 2026 Northwind", variant: "caption" } },
    "footer-links": { type: "Box", props: { direction: "horizontal", gap: "lg", label: "Footer links" }, children: ["footer-privacy", "footer-terms"] },
    "footer-privacy": { type: "Link", props: { label: "Privacy", variant: "muted" } },
    "footer-terms": { type: "Link", props: { label: "Terms", variant: "muted" } },
  },
};
