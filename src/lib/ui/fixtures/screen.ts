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

/** A panel with no content of its own: centered in a stacked row, it is only as wide as its padding. */
const shotPanel: FixtureChild = { type: "Box", props: { label: "Product shot", surface: "muted", padding: "lg", minHeight: "sm", radius: "md", grow: true } };

const verticalRule: FixtureChild = { type: "Separator", props: { orientation: "vertical" } };

export const boxFixtures: ComponentFixture[] = [
  { name: "Row, space between", props: { direction: "horizontal", align: "center", justify: "between", gap: "md", padding: "md", border: "all", radius: "lg" }, children: [{ type: "Heading", props: { text: "Weekly digest", level: 3 } }, { type: "Button", props: { label: "Subscribe" } }] },
  { name: "Card surface", props: { surface: "card", padding: "lg", gap: "sm", border: "all", radius: "xl", shadow: "sm", maxWidth: "sm" }, children: [{ type: "Heading", props: { text: "Starter", level: 3 } }, text("For one person and their agents.", { tone: "muted" }), { type: "Button", props: { label: "Choose Starter", variant: "outline" } }] },
  { name: "Inverse surface", props: { surface: "inverse", padding: "xl", gap: "sm", radius: "lg", align: "center" }, children: [{ type: "Heading", props: { text: "Ship the plan, not the meeting", level: 2, align: "center" } }, text("Everything inside reads on the dark band.", { tone: "muted", align: "center" }), { type: "Button", props: { label: "Get started" } }] },
  { name: "Stacks below md", props: { direction: "horizontal", stackBelow: "md", gap: "lg", align: "center" }, children: [text("A row on a wide page column, a column on a narrow one."), { type: "Placeholder", props: { label: "Product shot" } }] },
  { name: "Stacked, children keep their width", props: { direction: "horizontal", stackBelow: "md", gap: "lg", align: "center" }, children: [text("Centered across, in a row and once stacked: the panel shrinks to its content."), shotPanel] },
  { name: "Stacked, children fill the width", props: { direction: "horizontal", stackBelow: "md", gap: "lg", align: "center", alignBelow: "stretch" }, children: [text("Centered beside the panel in a row; each fills the width once the row has stacked."), shotPanel] },
  { name: "Stacked, drawn in reverse", props: { direction: "horizontal", stackBelow: "md", gap: "lg", align: "center", alignBelow: "stretch", reverseBelow: true }, children: [{ type: "Placeholder", props: { label: "Picture first in the row" } }, text("Words above the picture once the row has stacked.")] },
  { name: "Row with vertical rules", props: { direction: "horizontal", gap: "md", align: "center" }, children: [text("Docs"), verticalRule, text("Pricing"), verticalRule, text("Changelog")] },
  { name: "Vertical rules in a row that stacks", props: { direction: "horizontal", stackBelow: "md", gap: "md", align: "center" }, children: [text("Monthly"), verticalRule, text("Yearly")] },
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
  { name: "Accent", props: { name: "sparkles", size: "lg", tone: "accent" } },
];

export const placeholderFixtures: ComponentFixture[] = [
  { name: "Image", props: { label: "Hero image" } },
  { name: "Video, wide", props: { variant: "video", ratio: "wide", label: "Product tour" } },
  { name: "Map, square", props: { variant: "map", ratio: "square", radius: "xl" } },
  { name: "Logo", props: { variant: "logo", label: "Acme" } },
  { name: "Avatar", props: { variant: "avatar", label: "Maya Chen" } },
  { name: "Long label", props: { ratio: "portrait", label: longLabel.slice(0, 80) } },
  { name: "Browser frame", props: { frame: "browser", label: "Dashboard" } },
  { name: "Browser frame, address", props: { frame: "browser", label: "Dashboard", address: "app.example.com/stock" } },
  { name: "Browser frame, long address, wide", props: { frame: "browser", ratio: "wide", label: "Dashboard", address: longLabel.slice(0, 60) } },
  { name: "Phone frame", props: { frame: "phone", label: "Home screen" } },
  { name: "Browser frame, long label, wide", props: { frame: "browser", ratio: "wide", variant: "video", label: longLabel.slice(0, 80) } },
];

/** Extra Text, Heading, and Link fixtures for the screen props. */
export const screenTextFixtures: ComponentFixture[] = [
  { name: "Eyebrow", props: { text: "New in November", variant: "eyebrow" } },
  { name: "Caption", props: { text: "Billed yearly. Cancel any time.", variant: "caption" } },
  { name: "Mono", props: { text: "pnpm add artifacts", variant: "mono" } },
  { name: "Price, 4xl semibold", props: { text: "$29", size: "4xl", weight: "semibold" } },
  { name: "Centered, clamped to two lines", props: { text: `${longLabel}. ${longLabel}. ${longLabel}.`, align: "center", clamp: 2 } },
  { name: "Danger tone, end aligned", props: { text: "Payment failed.", tone: "danger", align: "end", size: "xs" } },
  { name: "Accent tone, semibold", props: { text: "New this month", tone: "accent", weight: "semibold" } },
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
  { name: "Inline with an icon", props: { label: "Read the guide", href: "https://example.com/guide", icon: "book" } },
  { name: "Inline, no address, icon at the end", props: { label: "See every plan", icon: "arrow-right", iconPosition: "end" } },
  { name: "Nav, icon at the end", props: { label: "Solutions", href: "https://example.com/solutions", variant: "nav", icon: "chevron-down", iconPosition: "end" } },
  { name: "Muted with an icon", props: { label: "Call sales", variant: "muted", icon: "phone" } },
];

type Elements = Record<string, { type: string; props: Record<string, unknown>; children?: string[] }>;

const tones = ["info", "success", "warning", "danger", "accent"] as const;

/** A pressed Button of each variant a toggle takes, by its label: the text color as the fill on every one. */
const pressedButtons = { italic: "outline", starred: "secondary", saved: "ghost" } as const;

/** One surface with everything that must read on it: body and muted text, each status tone and the accent as text and as an icon, a rule, links, and buttons, pressed ones included. */
function surfaceElements(surface: BoxSurface): Elements {
  const id = (part: string) => `${surface}-${part}`;
  // A chart and a diagram draw their own colors, so the surfaces that switch the palette each hold one of both.
  const drawn = surface === "inverse" || surface === "primary";
  const elements: Elements = {
    [id("box")]: { type: "Box", props: { surface, padding: "md", gap: "sm", radius: "lg", border: surface === "none" ? "all" : "none", label: `Surface ${surface}` }, children: [id("body"), id("muted"), id("tones"), id("rule"), id("actions"), ...(drawn ? [id("chart"), id("diagram")] : [])] },
    [id("body")]: { type: "Text", props: { text: `Body text on the ${surface} surface.` } },
    [id("muted")]: { type: "Text", props: { text: "Muted text, for secondary detail.", tone: "muted", size: "sm" } },
    // One wrapping row holds every small piece, so 15 surfaces stay under the 500-element limit: each tone as an icon and text, each
    // tone badge, and the display pieces, which draw their own text and marks (avatar letters on tints, a "+N" count, keys, stars, a dot).
    [id("tones")]: { type: "Box", props: { direction: "horizontal", wrap: true, gap: "md", align: "center" }, children: [...tones.flatMap((tone) => [id(`icon-${tone}`), id(`text-${tone}`)]), ...tones.map((tone) => id(`badge-${tone}`)), id("faces"), id("keys"), id("stars"), id("dot")] },
    [id("faces")]: { type: "AvatarGroup", props: { people: [{ name: "Maya Chen" }, { name: "Omar Haddad", tone: "info" }, { name: "Priya Nair", tone: "success" }, { name: "Ines Okafor", tone: "warning" }, { name: "Kenji Mori", tone: "danger" }], max: 4, total: 6, size: "sm" } },
    [id("keys")]: { type: "Kbd", props: { keys: ["⌘", "K"] } },
    [id("stars")]: { type: "Rating", props: { value: 3.5, showValue: true, size: "sm", label: `Rating on the ${surface} surface` } },
    [id("dot")]: { type: "Badge", props: { label: "Online", tone: "success", dot: "start" } },
    [id("rule")]: { type: "Separator", props: { label: "Details" } },
    [id("actions")]: { type: "Box", props: { direction: "horizontal", wrap: true, gap: "md", align: "center" }, children: [id("primary"), id("outline"), id("danger"), ...Object.keys(pressedButtons).map(id), id("nav"), id("quiet")] },
    [id("primary")]: { type: "Button", props: { label: "Primary" } },
    [id("outline")]: { type: "Button", props: { label: "Outline", variant: "outline" } },
    [id("danger")]: { type: "Button", props: { label: "Delete", variant: "danger", icon: "trash" } },
    [id("nav")]: { type: "Link", props: { label: "Nav link", variant: "nav" } },
    [id("quiet")]: { type: "Link", props: { label: "Muted link", variant: "muted" } },
  };
  if (drawn) {
    elements[id("chart")] = { type: "Chart", props: { type: "bar", title: `Orders on the ${surface} surface`, labels: ["Q1", "Q2", "Q3"], series: [{ name: "Online", values: [4, 6, 5] }, { name: "In store", values: [3, 2, 4] }, { name: "Phone", values: [1, 2, 1] }] } };
    elements[id("diagram")] = { type: "Diagram", props: { title: `Flow on the ${surface} surface`, code: "flowchart LR\n  A[Order] --> B[Pack] --> C[Ship]" } };
  }
  for (const [key, variant] of Object.entries(pressedButtons)) {
    elements[id(key)] = { type: "Button", props: { label: key.charAt(0).toUpperCase() + key.slice(1), variant, pressed: true } };
  }
  for (const tone of tones) {
    elements[id(`icon-${tone}`)] = { type: "Icon", props: { name: "circle-check", size: "sm", tone } };
    elements[id(`text-${tone}`)] = { type: "Text", props: { text: `${tone} text`, tone, size: "sm" } };
    elements[id(`badge-${tone}`)] = { type: "Badge", props: { label: `${tone} badge`, tone } };
  }
  return elements;
}

/** Every Box surface with every text tone, every tone badge, and a pressed Button of each variant on it, and a chart and a diagram on the two that switch the palette, for the contrast scan in light, in dark, and under themes. */
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

/**
 * One of every block whose look comes from a screen prop, each with words of
 * its own, so a test can find the same block in the read view and in the
 * interface editor and compare how it is drawn.
 */
export const styledBlocksSpec = {
  version: 1,
  root: "page",
  elements: {
    page: { type: "Box", props: { gap: "md" }, children: ["nav", "eyebrow", "title", "lead", "sub", "mono", "caption", "accent-note", "badges", "features", "actions", "note-short", "note-long", "hero", "stacked", "stat", "display", "spanned"] },
    spanned: { type: "Grid", props: { columns: 3, spans: [2, 1] }, children: ["spanned-wide", "spanned-narrow"] },
    "spanned-wide": { type: "Text", props: { text: "Wide cell" } },
    "spanned-narrow": { type: "Text", props: { text: "Narrow cell" } },
    nav: { type: "Box", props: { direction: "horizontal", align: "center", justify: "between", gap: "md", padding: "md", border: "bottom", wrap: true, label: "Styled navigation" }, children: ["nav-links", "nav-docs"] },
    "nav-links": { type: "Box", props: { direction: "horizontal", gap: "lg", wrap: true }, children: ["link-active", "link-plain", "link-muted-active", "link-muted"] },
    "link-active": { type: "Link", props: { label: "Product", variant: "nav", active: true } },
    "link-plain": { type: "Link", props: { label: "Pricing", variant: "nav", icon: "chevron-down", iconPosition: "end" } },
    "link-muted-active": { type: "Link", props: { label: "Changelog", variant: "muted", active: true } },
    "link-muted": { type: "Link", props: { label: "Careers", variant: "muted" } },
    "nav-docs": { type: "Link", props: { label: "Read the docs", href: "https://example.com/docs", icon: "book" } },
    eyebrow: { type: "Text", props: { text: "New this week", variant: "eyebrow" } },
    title: { type: "Heading", props: { text: "Count every shelf", level: 1, size: "display", align: "center" } },
    lead: { type: "Text", props: { text: "Stock that keeps up", size: "xl", weight: "semibold", align: "center", tone: "info" } },
    sub: { type: "Heading", props: { text: "Small heading at the end", level: 3, size: "sm", align: "end" } },
    mono: { type: "Text", props: { text: "order-4821", variant: "mono" } },
    caption: { type: "Text", props: { text: "Ends on Friday", variant: "caption", tone: "danger", weight: "medium", align: "end", clamp: 1 } },
    "accent-note": { type: "Text", props: { text: "Picked by the team", tone: "accent", size: "sm" } },
    badges: { type: "Box", props: { direction: "horizontal", gap: "sm", wrap: true, align: "center" }, children: ["badge-solid", "badge-outline", "badge-soft", "badge-accent", "badge-dot", "toggle-bold"] },
    "badge-dot": { type: "Badge", props: { label: "Online", tone: "success", dot: "start" } },
    "badge-solid": { type: "Badge", props: { label: "Shipped", tone: "success", variant: "solid", icon: "check" } },
    "badge-outline": { type: "Badge", props: { label: "Beta", tone: "info", variant: "outline" } },
    "badge-soft": { type: "Badge", props: { label: "Draft" } },
    "badge-accent": { type: "Badge", props: { label: "Featured", tone: "accent", variant: "outline" } },
    "toggle-bold": { type: "Button", props: { label: "Bold", variant: "outline", size: "sm", pressed: true } },
    features: { type: "List", props: { marker: "check", items: ["Unlimited projects", "Weekly reports"] } },
    actions: { type: "Box", props: { direction: "horizontal", gap: "sm", align: "center" }, children: ["action-start", "action-rule", "action-menu", "action-delete"] },
    "action-rule": { type: "Separator", props: { orientation: "vertical" } },
    "action-delete": { type: "Button", props: { label: "Delete draft", variant: "danger" } },
    stacked: { type: "Box", props: { direction: "horizontal", stackBelow: "md", align: "center", alignBelow: "stretch", reverseBelow: true, gap: "lg", label: "Stacked row" }, children: ["stacked-art", "stacked-copy"] },
    "stacked-art": { type: "Placeholder", props: { label: "Stacked shot", frame: "browser" } },
    "stacked-copy": { type: "Text", props: { text: "Words first on a phone" } },
    display: { type: "Box", props: { direction: "horizontal", gap: "md", align: "center", wrap: true, label: "Display pieces" }, children: ["display-faces", "display-keys", "display-stars", "display-unread"] },
    "display-faces": { type: "AvatarGroup", props: { people: [{ name: "Maya Chen" }, { name: "Omar Haddad", tone: "info" }, { name: "Priya Nair", tone: "success" }], max: 2 } },
    "display-keys": { type: "Kbd", props: { keys: ["⌘", "K"] } },
    "display-stars": { type: "Rating", props: { value: 3.5, showValue: true } },
    "display-unread": { type: "Badge", props: { label: "Unread", tone: "info", dot: "only" } },
    stat: { type: "Metric", props: { label: "Shelves counted", value: 1240, change: 12, changeFormat: "percent", goodDirection: "up", variant: "plain" } },
    "action-start": { type: "Button", props: { label: "Start free", size: "lg", icon: "arrow-right", iconPosition: "end" } },
    "action-menu": { type: "Button", props: { label: "Open menu", icon: "menu-2", iconOnly: true, variant: "ghost" } },
    "note-short": { type: "Textarea", props: { label: "Short note", rows: 2 } },
    "note-long": { type: "Textarea", props: { label: "Long note", rows: 6 } },
    hero: { type: "Box", props: { direction: "horizontal", gap: "lg", label: "Styled hero" }, children: ["hero-copy", "hero-art"] },
    "hero-copy": { type: "Box", props: { grow: true, surface: "muted", padding: "md", radius: "lg" }, children: ["hero-note"] },
    "hero-note": { type: "Text", props: { text: "Grows to fill the row" } },
    "hero-art": { type: "Box", props: { grow: true }, children: ["hero-image"] },
    "hero-image": { type: "Placeholder", props: { label: "Screenshot", ratio: "video" } },
  },
};

/**
 * A line that appears after a button press and is spoken to screen readers,
 * and a note that one button opens and closes with `toggleState`, saying
 * through `expanded` whether the note is open.
 */
export const announcedSpec = {
  version: 1,
  root: "page",
  state: { joined: false, open: false },
  elements: {
    page: { type: "Box", props: { gap: "md", padding: "lg", surface: "card", border: "all", radius: "xl", maxWidth: "md", label: "Waitlist" }, children: ["title", "join", "thanks", "more", "details"] },
    title: { type: "Heading", props: { text: "Join the waitlist", level: 3 } },
    join: { type: "Button", props: { label: "Join the list" }, on: { press: { action: "setState", params: { statePath: "/joined", value: true } } } },
    thanks: { type: "Text", props: { text: "Thanks. You are on the list.", tone: "success", announce: true }, visible: { $state: "/joined" } },
    more: { type: "Button", props: { label: "Details", variant: "outline", expanded: { $state: "/open" } }, on: { press: { action: "toggleState", params: { statePath: "/open" } } } },
    details: { type: "Callout", props: { title: "One email", text: "We write once, when your place is ready.", tone: "info", announce: true }, visible: { $state: "/open" } },
  },
};
