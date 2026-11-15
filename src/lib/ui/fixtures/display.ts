import type { ComponentFixture } from "./components";
import { longText } from "./long-text";

/* Fixtures for the display-only pieces of a screen: AvatarGroup, Kbd, and Rating. */

const team = [
  { name: "Maya Chen" },
  { name: "Omar Haddad", tone: "info" },
  { name: "Priya Nair", tone: "success" },
  { name: "Tomás de la Cruz", tone: "warning" },
  { name: "Ines Okafor", tone: "danger" },
  { name: "Dana Whitfield" },
  { name: "Kenji Mori", tone: "info" },
];

export const avatarGroupFixtures: ComponentFixture[] = [
  { name: "Three people", props: { people: team.slice(0, 3) } },
  { name: "Seven people, four shown", props: { people: team, max: 4 } },
  { name: "A sample of a larger group", props: { people: team.slice(0, 3), total: 2400, size: "lg" } },
  { name: "Small, with initials", props: { people: [{ name: "Northwind support", initials: "NS" }, { name: "Billing team", initials: "BT", tone: "info" }], size: "sm" } },
  { name: "Extra large, one person", props: { people: [{ name: longText(80) }], size: "xl" } },
];

export const kbdFixtures: ComponentFixture[] = [
  { name: "Command K", props: { keys: ["⌘", "K"] } },
  { name: "Control Shift P", props: { keys: ["Ctrl", "⇧", "P"] } },
  { name: "Escape", props: { keys: ["Esc"] } },
  { name: "Six keys", props: { keys: ["⌘", "⌥", "⇧", "⌃", "↵", "Long key name 20"] } },
];

export const ratingFixtures: ComponentFixture[] = [
  { name: "Four and a half", props: { value: 4.5, label: "Average rating", showValue: true } },
  { name: "Whole stars", props: { value: 3 } },
  { name: "Empty", props: { value: 0, size: "sm" } },
  { name: "Full, ten stars, large", props: { value: 10, max: 10, size: "lg", showValue: true } },
];
