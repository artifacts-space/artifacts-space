import { UI_SPEC_VERSION } from "@/lib/ui/version";

import { frameSizes } from "./limits";
import { CANVAS_VERSION } from "./version";

/**
 * Sample canvases for the dev fixture page, the gallery, the docs, and tests.
 * Tests check that each one stays valid (or stays broken, for the broken one).
 */

type Elements = Record<string, { type: string; props: Record<string, unknown>; children?: string[]; visible?: unknown }>;

function spec(root: string, elements: Elements, state?: Record<string, unknown>) {
  return { version: UI_SPEC_VERSION, root, elements, ...(state ? { state } : {}) };
}

function canvas(frames: readonly unknown[]) {
  return { version: CANVAS_VERSION, frames };
}

/** One landing page, drawn with `columns` cards per row so each frame size gets its own layout. */
function landingPage(columns: number) {
  return spec("page", {
    page: { type: "Stack", props: { gap: "lg" }, children: ["nav", "hero", "features-title", "features", "proof", "pricing", "faq", "footer"] },
    nav: { type: "Stack", props: { direction: "horizontal", gap: "md" }, children: ["brand", "nav-product", "nav-pricing", "nav-cta"] },
    brand: { type: "Badge", props: { label: "Northwind" } },
    "nav-product": { type: "Link", props: { label: "Product", href: "https://example.com/product" } },
    "nav-pricing": { type: "Link", props: { label: "Pricing", href: "https://example.com/pricing" } },
    "nav-cta": { type: "Button", props: { label: "Start free", variant: "outline" } },
    hero: { type: "Stack", props: { gap: "md" }, children: ["hero-title", "hero-copy", "hero-actions"] },
    "hero-title": { type: "Heading", props: { text: "Invoices that send themselves", level: 1 } },
    "hero-copy": { type: "Text", props: { text: "Connect your bank once. Northwind drafts, sends, and chases every invoice, so you get paid nine days sooner.", size: "lg" } },
    "hero-actions": { type: "Stack", props: { direction: "horizontal", gap: "sm" }, children: ["hero-primary", "hero-secondary"] },
    "hero-primary": { type: "Button", props: { label: "Start free" } },
    "hero-secondary": { type: "Button", props: { label: "Watch the demo", variant: "ghost" } },
    "features-title": { type: "Heading", props: { text: "Billing that runs itself", level: 2 } },
    features: { type: "Grid", props: { columns }, children: ["feature-draft", "feature-chase", "feature-books"] },
    "feature-draft": { type: "Card", props: { title: "Drafts from your calendar", description: "Finished work becomes a draft invoice the same day." } },
    "feature-chase": { type: "Card", props: { title: "Polite reminders", description: "Late payers get a friendly note at 3, 7, and 14 days." } },
    "feature-books": { type: "Card", props: { title: "Books that match", description: "Every payment lands in your ledger, already reconciled." } },
    proof: { type: "Grid", props: { columns }, children: ["proof-days", "proof-paid", "proof-teams"] },
    "proof-days": { type: "Metric", props: { label: "Days to payment", value: 12, change: -9, goodDirection: "down" } },
    "proof-paid": { type: "Metric", props: { label: "Paid on time", value: 0.94, format: "percent" } },
    "proof-teams": { type: "Metric", props: { label: "Teams", value: 4200, format: "compact" } },
    pricing: { type: "Section", props: { title: "Pricing", description: "Start free. Upgrade when you send more than ten invoices a month." }, children: ["plans"] },
    plans: { type: "Grid", props: { columns: Math.min(columns, 2) }, children: ["plan-free", "plan-team"] },
    "plan-free": { type: "Card", props: { title: "Free", description: "For your first clients." }, children: ["plan-free-list", "plan-free-cta"] },
    "plan-free-list": { type: "List", props: { items: ["10 invoices a month", "Reminders", "One bank account"] } },
    "plan-free-cta": { type: "Button", props: { label: "Start free", variant: "outline" } },
    "plan-team": { type: "Card", props: { title: "Team, $24 a month", description: "For a growing studio." }, children: ["plan-team-list", "plan-team-cta"] },
    "plan-team-list": { type: "List", props: { items: ["Unlimited invoices", "Shared ledger", "Five bank accounts"] } },
    "plan-team-cta": { type: "Button", props: { label: "Try Team" } },
    faq: { type: "Accordion", props: { items: [{ title: "Do my clients need an account?" }, { title: "Which banks work?" }] }, children: ["faq-clients", "faq-banks"] },
    "faq-clients": { type: "Text", props: { text: "No. They pay from the link in the invoice email." } },
    "faq-banks": { type: "Text", props: { text: "Any bank that offers a read-only connection. Most do." } },
    footer: { type: "Text", props: { text: "Northwind, Inc. Made for people who would rather do the work than bill for it.", tone: "muted", size: "sm" } },
  });
}

/**
 * The top of a landing page drawn edge to edge with Box: a navbar with a rule
 * under it, a hero on a contrasting surface, and a screenshot stand-in. It
 * goes in a frame with `padding: "none"`, so the surfaces reach the frame's
 * edges.
 */
const fullBleedHome = spec("page", {
  page: { type: "Box", props: {}, children: ["nav", "hero", "shot"] },
  nav: { type: "Box", props: { direction: "horizontal", align: "center", justify: "between", paddingX: "xl", paddingY: "md", surface: "card", border: "bottom" }, children: ["brand", "nav-links", "nav-cta"] },
  brand: { type: "Box", props: { direction: "horizontal", align: "center", gap: "sm" }, children: ["brand-mark", "brand-name"] },
  "brand-mark": { type: "Icon", props: { name: "star" } },
  "brand-name": { type: "Text", props: { text: "Northwind" } },
  "nav-links": { type: "Box", props: { direction: "horizontal", align: "center", gap: "lg" }, children: ["nav-product", "nav-pricing"] },
  "nav-product": { type: "Link", props: { label: "Product", href: "https://example.com/product" } },
  "nav-pricing": { type: "Link", props: { label: "Pricing", href: "https://example.com/pricing" } },
  "nav-cta": { type: "Button", props: { label: "Start free" } },
  hero: { type: "Box", props: { align: "center", paddingX: "xl", paddingY: "3xl", surface: "inverse" }, children: ["hero-copy"] },
  "hero-copy": { type: "Box", props: { maxWidth: "lg", gap: "md" }, children: ["hero-title", "hero-text", "hero-actions"] },
  "hero-title": { type: "Heading", props: { text: "Get paid nine days sooner", level: 1 } },
  "hero-text": { type: "Text", props: { text: "Connect your bank once. Northwind drafts, sends, and chases every invoice for you.", size: "lg" } },
  "hero-actions": { type: "Box", props: { direction: "horizontal", gap: "sm" }, children: ["hero-primary", "hero-secondary"] },
  "hero-primary": { type: "Button", props: { label: "Start free" } },
  "hero-secondary": { type: "Button", props: { label: "Watch the demo", variant: "outline" } },
  shot: { type: "Box", props: { padding: "xl", surface: "muted" }, children: ["shot-image"] },
  "shot-image": { type: "Placeholder", props: { variant: "image", ratio: "wide", label: "The invoices dashboard" } },
});

/** One page of a website at the three usual sizes, placed automatically, and its top again drawn edge to edge. */
export const siteMockupCanvas = canvas([
  { id: "home-desktop", name: "Home, desktop", width: frameSizes.desktop, spec: landingPage(3) },
  { id: "home-tablet", name: "Home, tablet", width: frameSizes.tablet, spec: landingPage(2) },
  { id: "home-phone", name: "Home, phone", width: frameSizes.phone, spec: landingPage(1) },
  { id: "home-full-bleed", name: "Home, edge to edge", width: frameSizes.desktop, padding: "none", spec: fullBleedHome },
]);

const phoneHeight = 844;

const signInScreen = spec(
  "screen",
  {
    screen: { type: "Stack", props: { gap: "lg" }, children: ["title", "copy", "remember", "continue", "help"] },
    title: { type: "Heading", props: { text: "Welcome back", level: 1 } },
    copy: { type: "Text", props: { text: "Sign in to see what your team shipped today.", tone: "muted" } },
    remember: { type: "Checkbox", props: { label: "Keep me signed in", checked: { $bindState: "/remember" } } },
    continue: { type: "Button", props: { label: "Continue with email" } },
    help: { type: "Link", props: { label: "Trouble signing in?", href: "https://example.com/help" } },
  },
  { remember: true },
);

const inboxScreen = spec("screen", {
  screen: { type: "Stack", props: { gap: "md" }, children: ["title", "tabs"] },
  title: { type: "Heading", props: { text: "Inbox", level: 1 } },
  tabs: { type: "Tabs", props: { tabs: [{ label: "Open" }, { label: "Done" }] }, children: ["open", "done"] },
  open: { type: "Section", props: { title: "Waiting on you" }, children: ["item-refund", "item-export"] },
  "item-refund": { type: "Card", props: { title: "Refund for order 4812", description: "Ada asked 2 hours ago" }, children: ["item-refund-badge"] },
  "item-refund-badge": { type: "Badge", props: { label: "Needs reply", tone: "warning" } },
  "item-export": { type: "Card", props: { title: "Export is stuck at 80%", description: "Lin asked yesterday" }, children: ["item-export-badge"] },
  "item-export-badge": { type: "Badge", props: { label: "In progress", tone: "info" } },
  done: { type: "Text", props: { text: "Nothing closed today yet.", tone: "muted" } },
});

const ticketScreen = spec("screen", {
  screen: { type: "Stack", props: { gap: "md" }, children: ["title", "facts", "history", "actions"] },
  title: { type: "Heading", props: { text: "Refund for order 4812", level: 1 } },
  facts: { type: "KeyValue", props: { items: [{ label: "Customer", value: "Ada Lovelace" }, { label: "Amount", value: 48, format: "currency" }, { label: "Status", value: "Needs reply", tone: "warning" }], currency: "USD" } },
  history: { type: "Timeline", props: { items: [{ title: "Order placed", status: "done" }, { title: "Refund requested", status: "current" }, { title: "Refund sent", status: "upcoming" }] } },
  actions: { type: "Stack", props: { direction: "horizontal", gap: "sm" }, children: ["approve", "decline"] },
  approve: { type: "Button", props: { label: "Approve refund" } },
  decline: { type: "Button", props: { label: "Decline", variant: "outline" } },
});

const settingsScreen = spec(
  "screen",
  {
    screen: { type: "Stack", props: { gap: "md" }, children: ["title", "alerts", "digest", "volume"] },
    title: { type: "Heading", props: { text: "Settings", level: 1 } },
    alerts: { type: "Switch", props: { label: "Push alerts", description: "For tickets assigned to you.", checked: { $bindState: "/alerts" } } },
    digest: { type: "Select", props: { label: "Email digest", options: ["Daily", "Weekly", "Never"], value: { $bindState: "/digest" } } },
    volume: { type: "Slider", props: { label: "Alert volume", value: { $bindState: "/volume" } } },
  },
  { alerts: true, digest: "Daily", volume: 60 },
);

/** Four screens of a phone app in one row, each at least a phone screen tall. */
export const appFlowCanvas = canvas([
  { id: "sign-in", name: "1. Sign in", width: frameSizes.phone, height: phoneHeight, spec: signInScreen },
  { id: "inbox", name: "2. Inbox", width: frameSizes.phone, height: phoneHeight, spec: inboxScreen },
  { id: "ticket", name: "3. Ticket", width: frameSizes.phone, height: phoneHeight, spec: ticketScreen },
  { id: "settings", name: "4. Settings", width: frameSizes.phone, height: phoneHeight, spec: settingsScreen },
]);

/** A canvas with no frames yet. */
export const emptyCanvas = canvas([]);

/** Three frames, the middle one with unusable fields and the last with a spec that cannot be drawn. The first still renders. */
export const brokenFrameCanvas = canvas([
  { id: "good", name: "Sign in", width: frameSizes.phone, spec: signInScreen },
  { id: "Bad Id", name: "", width: 99_999, spec: inboxScreen },
  { id: "no-root", name: "Missing root", width: frameSizes.phone, spec: { version: UI_SPEC_VERSION, root: "nowhere", elements: {} } },
]);

/**
 * Two rows placed by hand: the site above the app's screens. The phone frame
 * holds the same three-column page as the desktop frame, so it shows whether
 * a grid follows its frame's width or the window's.
 */
export const placedCanvas = canvas([
  { id: "home-desktop", name: "Home, desktop", width: frameSizes.desktop, x: 0, y: 0, spec: landingPage(3) },
  { id: "home-phone", name: "Home, phone", width: frameSizes.phone, x: 1520, y: 0, spec: landingPage(3) },
  { id: "sign-in", name: "Sign in", width: frameSizes.phone, height: phoneHeight, x: 0, y: 1800, spec: signInScreen },
  { id: "inbox", name: "Inbox", width: frameSizes.phone, height: phoneHeight, x: 470, y: 1800, spec: inboxScreen },
]);

/** A full board for rough timing: `count` frames of the landing page, about 35 elements each. */
export function largeCanvas(count: number) {
  return canvas(Array.from({ length: count }, (_, index) => ({ id: `page-${String(index + 1)}`, name: `Page ${String(index + 1)}`, width: [frameSizes.desktop, frameSizes.tablet, frameSizes.phone][index % 3], spec: landingPage(3 - (index % 3)) })));
}

/** The compact canvas the agent guide shows: one screen at two sizes. */
export const exampleCanvas = canvas([
  { id: "sign-in-phone", name: "Sign in, phone", width: frameSizes.phone, spec: signInScreen },
  {
    id: "sign-in-desktop",
    name: "Sign in, desktop",
    width: frameSizes.desktop,
    spec: spec("screen", {
      screen: { type: "Grid", props: { columns: 2 }, children: ["form", "pitch"] },
      form: { type: "Stack", props: { gap: "md", align: "start" }, children: ["title", "copy", "continue"] },
      title: { type: "Heading", props: { text: "Welcome back", level: 1 } },
      copy: { type: "Text", props: { text: "Sign in to see what your team shipped today.", tone: "muted" } },
      continue: { type: "Button", props: { label: "Continue with email" } },
      pitch: { type: "Quote", props: { text: "We close tickets twice as fast.", cite: "Lin, support lead" } },
    }),
  },
]);
