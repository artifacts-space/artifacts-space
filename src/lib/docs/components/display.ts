import { single, spec, text } from "../spec-builders";
import type { ComponentDoc } from "./types";

const people = [
  { name: "Maya Chen" },
  { name: "Omar Haddad", tone: "info" },
  { name: "Priya Nair", tone: "success" },
  { name: "Tomás de la Cruz", tone: "warning" },
  { name: "Ines Okafor" },
  { name: "Dana Whitfield", tone: "info" },
];

export const displayDocs: Record<"AvatarGroup" | "Kbd" | "Rating", ComponentDoc> = {
  AvatarGroup: {
    examples: [
      {
        title: "Who is on the project",
        spec: single("AvatarGroup", { people, max: 4 }),
      },
      {
        title: "A sample of a larger group",
        note: "`total` counts everyone, so the \"+N\" count covers people the spec does not list.",
        spec: spec("row", {
          row: { type: "Box", props: { direction: "horizontal", align: "center", gap: "sm", wrap: true }, children: ["faces", "words"] },
          faces: { type: "AvatarGroup", props: { people: people.slice(0, 3), total: 2400, size: "sm" } },
          words: text("Join 2,400 teams already counting their shelves.", { tone: "muted", size: "sm" }),
        }),
      },
    ],
    rules: [
      "Screen readers hear one name for the row: how many people, the names drawn, and how many more (\"6 people: Maya Chen, Omar Haddad, Priya Nair, Tomás de la Cruz, and 2 more\").",
      "`total` is at least the number of `people` listed; leave it out when the list is everyone.",
      "Like Avatar, a circle shows initials and never loads a picture. `initials` (up to 3 letters) replaces the letters taken from `name`.",
    ],
  },
  Kbd: {
    examples: [
      {
        title: "A shortcut beside what it does",
        spec: spec("row", {
          row: { type: "Box", props: { direction: "horizontal", align: "center", gap: "sm" }, children: ["what", "keys"] },
          what: text("Search", { size: "sm" }),
          keys: { type: "Kbd", props: { keys: ["⌘", "K"] } },
        }),
      },
      {
        title: "Keys written as words",
        spec: single("Box", { direction: "horizontal", gap: "md", wrap: true }, {
          palette: { type: "Kbd", props: { keys: ["Ctrl", "⇧", "P"] } },
          close: { type: "Kbd", props: { keys: ["Esc"] } },
        }),
      },
    ],
    rules: [
      "Each entry of `keys` is one key (up to 6 keys, 20 characters each). Symbols and short forms are read as words: ⌘ Command, ⌥ Option, ⇧ Shift, ⌃ or Ctrl Control, ↵ Enter, ⎋ or Esc Escape, the arrows by direction. Any other key is read as written.",
      "A Kbd stands alone. To label it, put it in a horizontal Box beside Text.",
    ],
  },
  Rating: {
    examples: [
      {
        title: "A product rating",
        spec: spec("row", {
          row: { type: "Box", props: { direction: "horizontal", align: "center", gap: "sm", wrap: true }, children: ["stars", "count"] },
          stars: { type: "Rating", props: { value: 4.5, label: "Average rating", showValue: true } },
          count: text("from 1,280 reviews", { tone: "muted", size: "sm" }),
        }),
      },
      {
        title: "Sizes",
        spec: single("Box", { gap: "sm" }, {
          small: { type: "Rating", props: { value: 3, size: "sm" } },
          large: { type: "Rating", props: { value: 5, size: "lg" } },
        }),
      },
    ],
    rules: [
      "A Rating is to look at: a reader cannot set it.",
      "`value` is a whole or half star, from 0 to `max` (1 to 10, default 5).",
      "Screen readers hear the score in words (\"Average rating: 4.5 out of 5\"), not each star.",
    ],
  },
};
