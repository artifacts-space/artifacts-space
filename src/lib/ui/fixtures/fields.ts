import type { ComponentFixture } from "./components";
import { longText, unbroken } from "./long-text";

/*
 * Fixtures for text fields, avatars, and the screen props of Button, Badge,
 * List, Select, and Image, plus a sign-in screen that shows the set composes
 * and that its password field is only drawn, and a toggle that stays pressed.
 */

export const inputFixtures: ComponentFixture[] = [
  { name: "Normal", props: { label: "Work email", type: "email", placeholder: "you@example.com", description: "We only use it to show the mockup." } },
  { name: "With an error", props: { label: "Team name", value: "a", error: "Use at least two characters." } },
  { name: "Search, label hidden", props: { label: "Search the docs", type: "search", placeholder: "Search…", hideLabel: true, fullWidth: true } },
  { name: "Number", props: { label: "Seats", type: "number", value: "5" } },
  { name: "Disabled", props: { label: "Plan", value: "Team", disabled: true } },
  { name: "Password stand-in", props: { label: "Password", type: "password", description: "At least 12 characters." } },
  { name: "Password stand-in, disabled", props: { label: "Current password", type: "password", disabled: true } },
  { name: "Long", props: { label: longText(120), placeholder: longText(120), description: longText(400), error: unbroken(300), value: unbroken(500) } },
  { name: "Search with an icon", props: { label: "Search the docs", type: "search", placeholder: "Search…", icon: "search", hideLabel: true } },
  { name: "Email with an icon and an error", props: { label: "Email", type: "email", value: "maya@", icon: "mail", error: "Enter a full email address." } },
  { name: "Disabled with an icon", props: { label: "Phone", value: "+1 555 0100", icon: "phone", disabled: true } },
  { name: "Password stand-in with an icon", props: { label: "Password", type: "password", icon: "lock" } },
];

export const textareaFixtures: ComponentFixture[] = [
  { name: "Normal", props: { label: "Message", placeholder: "How can we help?", rows: 4 } },
  { name: "Two rows", props: { label: "Short note", rows: 2 } },
  { name: "Six rows", props: { label: "Long note", rows: 6 } },
  { name: "With an error, full width", props: { label: "Feedback", value: "ok", error: "Tell us a little more.", fullWidth: true } },
  { name: "Disabled", props: { label: "Notes", value: "Locked while the review runs.", disabled: true } },
  { name: "Long", props: { label: longText(120), description: longText(400), value: longText(5000), rows: 12 } },
];

export const avatarFixtures: ComponentFixture[] = [
  { name: "Initials", props: { name: "Maya Chen" } },
  { name: "Small, one name", props: { name: "Priya", size: "sm", tone: "info" } },
  { name: "Extra large, success", props: { name: "Tomás de la Cruz", size: "xl", tone: "success" } },
  { name: "No letters", props: { name: "— —", size: "lg" } },
  { name: "Long name", props: { name: longText(80), tone: "warning" } },
];

export const screenButtonFixtures: ComponentFixture[] = [
  { name: "Small", props: { label: "Details", size: "sm", variant: "outline" } },
  { name: "Large with a trailing icon", props: { label: "Start free", size: "lg", icon: "arrow-right", iconPosition: "end" } },
  { name: "Full width", props: { label: "Continue", fullWidth: true } },
  { name: "Icon only", props: { label: "Open menu", icon: "menu-2", iconOnly: true, variant: "ghost" } },
  { name: "Icon only, large", props: { label: "Play the tour", icon: "player-play", iconOnly: true, size: "lg" } },
  { name: "Disabled", props: { label: "Sold out", disabled: true, variant: "secondary" } },
  { name: "Danger", props: { label: "Delete project", variant: "danger" } },
  { name: "Danger with an icon", props: { label: "Remove member", variant: "danger", icon: "trash", size: "sm" } },
  { name: "Danger, disabled", props: { label: "Delete account", variant: "danger", disabled: true } },
  { name: "Disclosure, closed", props: { label: "Show more", variant: "outline", icon: "chevron-down", iconPosition: "end", expanded: false } },
  { name: "Disclosure, open", props: { label: "Show less", variant: "outline", icon: "chevron-up", iconPosition: "end", expanded: true } },
  { name: "Toggle, not pressed", props: { label: "Bold", variant: "outline", pressed: false } },
  { name: "Toggle, pressed, outline", props: { label: "Bold", variant: "outline", pressed: true } },
  { name: "Toggle, not pressed, secondary with an icon", props: { label: "Starred", variant: "secondary", icon: "star", pressed: false } },
  { name: "Toggle, not pressed, ghost icon only", props: { label: "Saved", variant: "ghost", icon: "bookmark", iconOnly: true, pressed: false } },
  { name: "Toggle, pressed, secondary with an icon", props: { label: "Starred", variant: "secondary", icon: "star", pressed: true } },
  { name: "Toggle, pressed, ghost icon only", props: { label: "Saved", variant: "ghost", icon: "bookmark", iconOnly: true, pressed: true } },
];

export const screenBadgeFixtures: ComponentFixture[] = [
  { name: "Solid", props: { label: "New", tone: "info", variant: "solid" } },
  { name: "Solid, neutral", props: { label: "Popular", variant: "solid" } },
  { name: "Outline with an icon", props: { label: "Verified", tone: "success", variant: "outline", icon: "check" } },
  { name: "Solid danger, long", props: { label: longText(60), tone: "danger", variant: "solid", icon: "alert-triangle" } },
  { name: "Accent", props: { label: "Featured", tone: "accent" } },
  { name: "Accent, solid", props: { label: "New", tone: "accent", variant: "solid" } },
  { name: "Accent, outline with an icon", props: { label: "Staff pick", tone: "accent", variant: "outline", icon: "star" } },
  { name: "Dot before the label", props: { label: "Online", tone: "success", dot: "start" } },
  { name: "Dot on a solid badge", props: { label: "Live", tone: "danger", variant: "solid", dot: "start" } },
  { name: "Dot alone", props: { label: "Unread", tone: "info", dot: "only" } },
  { name: "Dot alone, neutral", props: { label: "Away", dot: "only" } },
];

export const screenListFixtures: ComponentFixture[] = [
  { name: "Check marks", props: { items: ["Unlimited artifacts", "Team sharing", longText(300)], marker: "check" } },
  { name: "Crosses", props: { items: ["No audit log", "No single sign-on"], marker: "cross" } },
  { name: "Arrows", props: { items: ["Read the guide", unbroken(200)], marker: "arrow" } },
];

export const screenSelectFixtures: ComponentFixture[] = [
  { name: "With an error", props: { label: "Region", options: ["Europe", "Americas", "Asia"], error: "Choose a region to continue.", description: "Where your team works." } },
  { name: "Disabled, label hidden", props: { label: "Sort by", options: ["Newest", "Oldest"], value: "Newest", disabled: true, hideLabel: true } },
  { name: "Full width", props: { label: "Country", options: ["Canada", "Mexico", "United States"], placeholder: "Choose a country", fullWidth: true } },
];

/** Image fixtures need a file id, so the caller passes the gallery's stand-in image. */
export function screenImageFixtures(file: string): ComponentFixture[] {
  return [
    { name: "Video ratio, cropped", props: { file, alt: "Architecture diagram", ratio: "video", radius: "xl" } },
    { name: "Square, fitted, round", props: { file, alt: "Architecture diagram", ratio: "square", fit: "contain", radius: "full", caption: "Fitted inside a circle." } },
  ];
}

/** A sign-in screen built only from the catalog. The email mirrors what is typed; the password is a stand-in. */
export const signInSpec = {
  version: 1,
  root: "page",
  state: { email: "" },
  elements: {
    page: { type: "Box", props: { surface: "muted", padding: "xl", align: "center" }, children: ["card"] },
    card: { type: "Box", props: { surface: "card", padding: "lg", gap: "md", border: "all", radius: "xl", shadow: "sm", maxWidth: "sm", label: "Sign in" }, children: ["brand", "title", "email", "password", "submit", "echo", "help"] },
    brand: { type: "Box", props: { direction: "horizontal", align: "center", gap: "sm" }, children: ["brand-mark", "brand-name"] },
    "brand-mark": { type: "Avatar", props: { name: "Northwind", size: "sm", tone: "info" } },
    "brand-name": { type: "Text", props: { text: "Northwind", weight: "semibold" } },
    title: { type: "Heading", props: { text: "Sign in to your account", level: 2, size: "lg" } },
    email: { type: "Input", props: { label: "Email", type: "email", placeholder: "you@example.com", fullWidth: true, icon: "mail", value: { $bindState: "/email" } } },
    password: { type: "Input", props: { label: "Password", type: "password", fullWidth: true, icon: "lock" } },
    submit: { type: "Button", props: { label: "Sign in", fullWidth: true, icon: "arrow-right", iconPosition: "end" } },
    echo: { type: "Text", props: { variant: "caption", text: { $template: "Signing in as ${/email}" } }, visible: { $state: "/email" } },
    help: { type: "Link", props: { label: "Forgot your password?", variant: "muted" } },
  },
};

/** A toggle that stays pressed: one press flips `/bold`, the button reads it as `pressed`, and the sample text follows. */
export const pressedToggleSpec = {
  version: 1,
  root: "page",
  state: { bold: false },
  elements: {
    page: { type: "Box", props: { gap: "sm", padding: "md", border: "all", radius: "lg", maxWidth: "md", label: "Text style" }, children: ["bold", "sample"] },
    bold: { type: "Button", props: { label: "Bold", variant: "outline", size: "sm", pressed: { $state: "/bold" } }, on: { press: { action: "toggleState", params: { statePath: "/bold" } } } },
    sample: { type: "Text", props: { text: "The quick note reads heavier while Bold is on.", weight: { $cond: { $state: "/bold" }, $then: "semibold", $else: "normal" } } },
  },
};
