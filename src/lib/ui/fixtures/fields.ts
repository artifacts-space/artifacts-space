import type { ComponentFixture } from "./components";
import { longText, unbroken } from "./long-text";

/*
 * Fixtures for text fields, avatars, and the screen props of Button, Badge,
 * List, Select, and Image, plus a sign-in screen that shows the set composes
 * and that its password field is only drawn.
 */

export const inputFixtures: ComponentFixture[] = [
  { name: "Normal", props: { label: "Work email", type: "email", placeholder: "you@example.com", description: "We only use it to show the mockup." } },
  { name: "With an error", props: { label: "Team name", value: "a", error: "Use at least two characters." } },
  { name: "Search, label hidden", props: { label: "Search the docs", type: "search", placeholder: "Search…", hideLabel: true, fullWidth: true } },
  { name: "Number", props: { label: "Seats", type: "number", value: "5" } },
  { name: "Disabled", props: { label: "Plan", value: "Team", disabled: true } },
  { name: "Password stand-in", props: { label: "Password", type: "password", description: "Drawn only: it cannot be typed into." } },
  { name: "Password stand-in, disabled", props: { label: "Current password", type: "password", disabled: true } },
  { name: "Long", props: { label: longText(120), placeholder: longText(120), description: longText(400), error: unbroken(300), value: unbroken(500) } },
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
];

export const screenBadgeFixtures: ComponentFixture[] = [
  { name: "Solid", props: { label: "New", tone: "info", variant: "solid" } },
  { name: "Solid, neutral", props: { label: "Popular", variant: "solid" } },
  { name: "Outline with an icon", props: { label: "Verified", tone: "success", variant: "outline", icon: "check" } },
  { name: "Solid danger, long", props: { label: longText(60), tone: "danger", variant: "solid", icon: "alert-triangle" } },
];

export const screenListFixtures: ComponentFixture[] = [
  { name: "Check marks", props: { items: ["Unlimited artifacts", "Team sharing", longText(300)], marker: "check" } },
  { name: "Crosses", props: { items: ["No audit log", "No single sign-on"], marker: "cross" } },
  { name: "Arrows", props: { items: ["Read the guide", unbroken(200)], marker: "arrow" } },
];

export const screenSelectFixtures: ComponentFixture[] = [
  { name: "With an error", props: { label: "Region", options: ["Europe", "Americas", "Asia"], error: "Choose a region to continue.", description: "Where your team works." } },
  { name: "Disabled, label hidden", props: { label: "Sort by", options: ["Newest", "Oldest"], value: "Newest", disabled: true, hideLabel: true } },
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
    email: { type: "Input", props: { label: "Email", type: "email", placeholder: "you@example.com", fullWidth: true, value: { $bindState: "/email" } } },
    password: { type: "Input", props: { label: "Password", type: "password", fullWidth: true } },
    submit: { type: "Button", props: { label: "Sign in", fullWidth: true, icon: "arrow-right", iconPosition: "end" } },
    echo: { type: "Text", props: { variant: "caption", text: { $template: "Signing in as ${/email}" } }, visible: { $state: "/email" } },
    help: { type: "Link", props: { label: "Forgot your password?", variant: "muted" } },
  },
};
