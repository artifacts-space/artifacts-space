import type { UiTemplate } from "./types";

/**
 * Heroes and calls to action (batch B). Categories: hero, cta. The shared
 * test (templates.test.ts) and the e2e loop (e2e/templates.spec.ts) cover
 * every template added here.
 */
export const heroTemplates: readonly UiTemplate[] = [
  {
    id: "hero-centered",
    name: "Hero, centered",
    category: "hero",
    description: "A centered opening: a short announcement, the page's headline, one supporting sentence, and two buttons.",
    viewport: "fluid",
    surface: "page",
    slots: [
      { what: "Announcement", element: "pill", prop: "label" },
      { what: "Headline", element: "title", prop: "text" },
      { what: "Supporting sentence", element: "text", prop: "text" },
      { what: "Main button label", element: "primary", prop: "label" },
      { what: "Second button label", element: "secondary", prop: "label" },
      { what: "Small note under the buttons", element: "note", prop: "text" },
    ],
    fragment: {
      root: "hero",
      elements: {
        hero: { type: "Box", props: { direction: "vertical", align: "center", gap: "lg", paddingX: "lg", paddingY: "3xl", surface: "page" }, children: ["pill", "copy", "actions", "note"] },
        pill: { type: "Badge", props: { label: "New: shared boards for every team", tone: "info" } },
        copy: { type: "Box", props: { direction: "vertical", align: "center", gap: "md", maxWidth: "lg" }, children: ["title", "text"] },
        title: { type: "Heading", props: { text: "Plan the week in one calm place", level: 1, size: "display", align: "center" } },
        text: { type: "Text", props: { text: "Bring tasks, notes, and deadlines together, so your team always knows what comes next.", size: "lg", tone: "muted", align: "center" } },
        actions: { type: "Box", props: { direction: "horizontal", justify: "center", gap: "sm", wrap: true }, children: ["primary", "secondary"] },
        primary: { type: "Button", props: { label: "Start free" } },
        secondary: { type: "Button", props: { label: "See how it works", variant: "outline" } },
        note: { type: "Text", props: { text: "Free for teams of up to five. No card needed.", variant: "caption", align: "center" } },
      },
    },
  },
];
