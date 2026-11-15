import { single, spec, text, type DocElement } from "../spec-builders";
import type { ComponentDoc } from "./types";

const icon = (name: string, extra: Record<string, unknown> = {}): DocElement => ({ type: "Icon", props: { name, ...extra } });
const navLink = (label: string, extra: Record<string, unknown> = {}): DocElement => ({ type: "Link", props: { label, variant: "nav", ...extra } });

const containerWidths = "Responsive props follow the width of the page column or canvas frame, never the browser window: sm is 576, md is 672, and lg is 896 pixels.";

export const boxDocs: Record<"Box", ComponentDoc> = {
  Box: {
    examples: [
      {
        title: "A navigation bar",
        note: "The links hide on a narrow page column.",
        spec: spec("nav", {
          nav: { type: "Box", props: { direction: "horizontal", align: "center", justify: "between", gap: "md", padding: "md", border: "bottom", label: "Site navigation" }, children: ["brand", "links", "cta"] },
          brand: text("Northwind", { weight: "semibold" }),
          links: { type: "Box", props: { direction: "horizontal", gap: "lg", hideBelow: "md" }, children: ["product", "pricing", "docs"] },
          product: navLink("Product", { active: true }),
          pricing: navLink("Pricing"),
          docs: navLink("Docs"),
          cta: { type: "Button", props: { label: "Sign in", variant: "outline" } },
        }),
      },
      {
        title: "A hero that stacks",
        note: "A row on a wide page column, a column below 672 pixels.",
        spec: spec("hero", {
          hero: { type: "Box", props: { direction: "horizontal", stackBelow: "md", align: "center", gap: "xl", padding: "lg" }, children: ["copy", "art"] },
          copy: { type: "Box", props: { grow: true, gap: "md" }, children: ["title", "lead", "action"] },
          title: { type: "Heading", props: { text: "Know what is on every shelf", level: 2, size: "xl" } },
          lead: text("Stock counts that keep up with the stockroom.", { tone: "muted", size: "lg" }),
          action: { type: "Button", props: { label: "Start free" } },
          art: { type: "Box", props: { grow: true, width: "full" }, children: ["image"] },
          image: { type: "Placeholder", props: { label: "Dashboard screenshot", ratio: "photo", radius: "xl" } },
        }),
      },
      {
        title: "Surfaces",
        note: "Each surface sets a text color that reads on it. Inverse switches everything inside to the other palette.",
        spec: spec("row", {
          row: { type: "Grid", props: { columns: 3 }, children: ["card", "tint", "band"] },
          card: { type: "Box", props: { surface: "card", padding: "lg", gap: "xs", border: "all", radius: "xl", shadow: "sm" }, children: ["card-title", "card-note"] },
          "card-title": text("Card", { weight: "medium" }),
          "card-note": text("With an edge and a soft shadow.", { tone: "muted", size: "sm" }),
          tint: { type: "Box", props: { surface: "blue", padding: "lg", gap: "xs", radius: "xl" }, children: ["tint-title", "tint-note"] },
          "tint-title": text("Blue", { weight: "medium" }),
          "tint-note": text("One of nine hue tints.", { tone: "muted", size: "sm" }),
          band: { type: "Box", props: { surface: "inverse", padding: "lg", gap: "xs", radius: "xl" }, children: ["band-title", "band-note"] },
          "band-title": text("Inverse", { weight: "medium" }),
          "band-note": text("Muted text still reads here.", { tone: "muted", size: "sm" }),
        }),
      },
    ],
    rules: [
      "Every style prop is a named step. A Box takes no CSS, colors, or pixel sizes.",
      containerWidths,
      "`stackBelow` needs `direction: \"horizontal\"`. `hideAbove` must be a wider step than `hideBelow`.",
      "`alignBelow` and `reverseBelow` need a row with `stackBelow`. `alignBelow` is the `align` to use once the row has stacked: a row with `align: \"center\"` shrinks each stacked child to its content unless `alignBelow` is `stretch`. Without it the row's `align` applies at every width.",
      "`reverseBelow` draws the stacked children last first, so words can sit above a picture that comes first in the row. It changes what is drawn, not the order a keyboard or a screen reader follows, so use it only when at most one side holds buttons, links, or fields.",
      "`overflow: \"scroll\"` needs `direction: \"horizontal\"` and no `wrap`. Give the Box a `label`: while it scrolls it is a named group the keyboard can reach.",
      "Inverse and primary do not nest: inside either, both paint the surrounding surface.",
      "Use a shadow on a surface that sits on the page, never on a Box inside a card.",
    ],
  },
};

export const iconDocs: Record<"Icon", ComponentDoc> = {
  Icon: {
    examples: [
      {
        title: "Beside text",
        spec: spec("row", {
          row: { type: "Box", props: { direction: "horizontal", align: "center", gap: "sm" }, children: ["mark", "words"] },
          mark: icon("circle-check", { tone: "success" }),
          words: text("All checks passed."),
        }),
      },
      { title: "Named for screen readers", note: "With a `label` the icon is announced; without one it is decorative.", spec: single("Icon", { name: "star", size: "lg", tone: "warning", label: "Rated five stars" }) },
      {
        title: "In the accent color",
        spec: spec("row", {
          row: { type: "Box", props: { direction: "horizontal", align: "center", gap: "sm" }, children: ["mark", "words"] },
          mark: icon("sparkles", { tone: "accent" }),
          words: text("New in this release.", { tone: "accent" }),
        }),
      },
    ],
    rules: ["`name` is one of the listed icon names. An unknown name fails validation.", "An icon that carries meaning on its own needs a `label`.", "`tone`: default, muted, a status tone (info, success, warning, danger), or accent, the theme's accent color. Every tone reads on every Box surface and in every theme."],
  },
};

export const placeholderDocs: Record<"Placeholder", ComponentDoc> = {
  Placeholder: {
    examples: [
      { title: "An image stand-in", spec: single("Placeholder", { label: "Team photo", ratio: "wide", radius: "xl" }) },
      {
        title: "A product shot in a browser and on a phone",
        spec: spec("row", {
          row: { type: "Box", props: { direction: "horizontal", stackBelow: "sm", align: "end", alignBelow: "center", gap: "lg" }, children: ["desktop", "phone"] },
          desktop: { type: "Box", props: { grow: true }, children: ["window"] },
          window: { type: "Placeholder", props: { frame: "browser", label: "Dashboard" } },
          phone: { type: "Placeholder", props: { frame: "phone", label: "Home screen" } },
        }),
      },
      {
        title: "Logos and an avatar",
        spec: spec("row", {
          row: { type: "Box", props: { direction: "horizontal", wrap: true, align: "center", gap: "md" }, children: ["acme", "globex", "person"] },
          acme: { type: "Placeholder", props: { variant: "logo", label: "Acme" } },
          globex: { type: "Placeholder", props: { variant: "logo", label: "Globex" } },
          person: { type: "Placeholder", props: { variant: "avatar", label: "Maya Chen" } },
        }),
      },
    ],
    rules: [
      "A placeholder never loads a file. Use Image for an uploaded picture.",
      "`label` is what screen readers announce; the small logo and avatar shapes do not show it.",
      "`frame` (browser or phone) draws a window or a phone around an image, video, or map stand-in. The frame is decoration: its dots and bars are not controls and are hidden from screen readers. A framed stand-in ignores `radius`; a phone frame is at most 256 pixels wide and defaults to the portrait ratio.",
    ],
  },
};
