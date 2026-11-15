import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import type { z } from "zod";

import { contentChecks, contentProps } from "./props/content";
import { chartDescription } from "./props/chart";
import { dataChecks, dataProps, type PropCheck } from "./props/data";
import { fieldDescriptions } from "./props/fields";
import { inputChecks, inputEvents, inputProps } from "./props/input";
import { layoutProps, separatorCheck } from "./props/layout";
import { mediaChecks, mediaProps } from "./props/media";
import { planningChecks, planningDescriptions, planningProps } from "./props/planning";
import { boxCheck, placeholderCheck, screenDescriptions } from "./props/screen";

/**
 * The stout component set: zod-only and server-safe. The React registry in
 * src/components/artifact-view/ui implements every component listed here.
 * Media components (Image, File) accept only uploaded file ids, never URLs.
 */
export const componentProps = {
  ...layoutProps,
  ...contentProps,
  ...dataProps,
  ...planningProps,
  ...inputProps,
  ...mediaProps,
};

export type UiComponentName = keyof typeof componentProps;
export type UiProps<K extends UiComponentName> = z.output<(typeof componentProps)[K]>;

/** Component names, in catalog order. */
export const uiComponentNames = Object.keys(componentProps) as UiComponentName[];

/** Components that render their `children`. Every other component is a leaf. */
export const containerComponents: ReadonlySet<UiComponentName> = new Set([
  "Section",
  "Stack",
  "Grid",
  "Card",
  "Tabs",
  "Accordion",
  "Box",
]);

/** Cross-field prop rules. Most are checked after the zod schema passes; see `fieldWiseChecks`. */
export const componentChecks: Partial<Record<UiComponentName, PropCheck>> = { ...contentChecks, ...dataChecks, ...planningChecks, ...inputChecks, ...mediaChecks, Box: boxCheck, Placeholder: placeholderCheck, Separator: separatorCheck };

/**
 * Components whose rule reads only the props it is about, each on its own.
 * Their rule runs even when another prop fails the schema, so validation
 * reports every problem at once. A new rule should be written this way and
 * listed here.
 */
export const fieldWiseChecks: ReadonlySet<UiComponentName> = new Set(["Box", "Input", "Button", "List", "Placeholder", "Separator"]);

/** Events a component can emit for `on` bindings. */
export const componentEvents: Partial<Record<UiComponentName, readonly string[]>> = inputEvents;

const descriptions: Record<UiComponentName, string> = {
  Section: "A titled region of the page. Use it to group related content. Children stack vertically.",
  Stack: "Lays children out vertically (default) or horizontally. Horizontal stacks wrap on narrow screens.",
  Grid: "A responsive grid. `columns` (1-4) applies where the interface is wide enough; a narrow one shows fewer, and phones show one column.",
  Card: "A bordered surface with an optional title and description. Children go inside.",
  Tabs: "Tabbed panels. Give one `tabs` entry per child: child N is the panel for tab N.",
  Accordion: "Collapsible panels. Give one `items` entry per child: child N is the body of item N.",
  Separator: "A horizontal rule, optionally with a short label. `orientation: \"vertical\"` draws a thin line between two items in a horizontal Box, as tall as the row; once a `stackBelow` row has stacked it lies flat between the same items. It takes no `label`.",
  Box: screenDescriptions.Box,
  Heading: "A heading. `level` 1-4 (default 2) sets its place in the outline; use one level-1 heading at most. `size` (sm, md, lg, xl, 2xl, display) sets how large it looks without changing the level; `align` places it.",
  Text: "A paragraph of plain text. Line breaks are kept. `variant`: body (default), eyebrow (a small uppercase label), caption (small and muted), or mono. `size` (xs to 4xl), `weight`, `align`, and `tone` (default, muted, or a status tone) style it; `clamp` cuts it off after 1-3 lines. `announce` speaks the text to screen readers when it appears after a reader's action (a \"thank you\" line shown by a button press); leave it off text that is there from the start.",
  Markdown: "GitHub-flavored Markdown (tables, task lists). Raw HTML is not rendered.",
  Code: "A block of source code with an optional language label and title.",
  Callout: "A highlighted note. `tone`: neutral, info, success, warning, or danger. `announce` speaks it to screen readers when it appears after a reader's action.",
  Badge: "A small status label with a tone. `variant`: soft (default), solid, or outline. `icon` puts an icon by name (see Icon) before the label.",
  List: "A bulleted or numbered list of plain-text items. `marker` replaces the bullets with an icon: check, cross, or arrow.",
  Steps: "A numbered how-to or runbook. Each item has a `title`, an optional `body` in Markdown, and optional `code` (with `language`) to copy and run.",
  Link: "A link that opens in a new tab. Only absolute http, https, and mailto URLs are allowed; leave `href` out for a mockup link that goes nowhere. `variant`: inline (default, underlined), nav (a plain menu link), or muted (small and quiet, for footers). `active` marks the current page.",
  Quote: "A block quote with an optional citation.",
  Icon: screenDescriptions.Icon,
  Avatar: fieldDescriptions.Avatar,
  Table: "A data table. `rows` are objects keyed by each column's `key`. Missing cells show a dash. Up to 500 rows. A column's `format` shows numbers (number, compact, percent, currency) or, with `check`, draws true as a check mark and false as a dash, each read out as Yes or No; without it true and false show as the words Yes and No.",
  Metric: "A key number with a label, an optional unit, and an optional change. `change` uses `changeFormat` (default: the value's `format`), so a revenue metric usually sets changeFormat \"percent\". `goodDirection` says whether up or down is good. `sparkline` (2-200 numbers, oldest first) draws a small trend line under the value. `variant: \"plain\"` shows the number, label, and change without the card, for a band of stats.",
  Chart: chartDescription,
  KeyValue: "Label and value pairs for specs, settings, and summaries. Each item's `format` styles a number like a Table column; `tone` shows the value as a status badge; `mono` shows it in monospace (ids, paths). `columns`: 1, or 2 where the interface is wide enough.",
  Progress: "A progress bar. `value` out of `max` (default 100).",
  Timeline: "A vertical list of dated events with done, current, or upcoming status.",
  Board: planningDescriptions.Board,
  Calendar: planningDescriptions.Calendar,
  Diagram: "A Mermaid diagram (flowchart, sequence, class, state, ER, gantt, and more). Put the Mermaid source in `code`.",
  Checklist: "A list of items a reader can tick off. Ticks stay on the page only.",
  Checkbox: "One checkbox. Bind `checked` with { \"$bindState\": \"/path\" } to share it with other elements.",
  Select: "A dropdown of text options. Bind `value` with { \"$bindState\": \"/path\" }. Takes `description`, `error`, `hideLabel`, `disabled`, and `fullWidth` like Input.",
  Switch: "An on/off switch. Bind `checked` with { \"$bindState\": \"/path\" }.",
  Slider: "A numeric slider between `min` (default 0) and `max` (default 100). Bind `value` with { \"$bindState\": \"/path\" }.",
  Button: "A button. Its `press` event can run setState, toggleState, pushState, or removeState through `on`. It cannot load or send data. `variant`: default, outline, secondary, ghost, or danger (a solid fill in the danger tone, for an action that deletes or cannot be undone). `size` (sm, md, lg), `fullWidth`, `disabled`, and an `icon` by name (see Icon) at the start or the end (`iconPosition`); `iconOnly` shows the icon alone, with `label` as its name for screen readers.",
  Input: fieldDescriptions.Input,
  Textarea: fieldDescriptions.Textarea,
  Image: "An uploaded image (PNG, JPEG, GIF, WebP, or AVIF), shown at up to its natural size. `file` is the id from files_finalize; `alt` describes it for screen readers. `ratio` (square, photo 4:3, video 16:9, wide 21:9, portrait 3:4) fills the width and crops to that shape; `fit: \"contain\"` shows all of it instead; `radius` rounds it.",
  File: "A download card for an uploaded file: name, type, and size. `file` is the id from files_finalize; `label` replaces the shown name.",
  Placeholder: screenDescriptions.Placeholder,
};

function componentDefinition(name: UiComponentName) {
  return {
    props: componentProps[name],
    slots: containerComponents.has(name) ? ["default"] : [],
    description: descriptions[name],
  };
}

/** The json-render catalog for ui artifacts. */
export const uiCatalog = defineCatalog(schema, {
  components: Object.fromEntries(uiComponentNames.map((name) => [name, componentDefinition(name)])) as {
    [K in UiComponentName]: { props: (typeof componentProps)[K]; slots: string[]; description: string };
  },
  actions: {},
});

/** True when `name` is a component in the catalog. */
export function isUiComponentName(name: unknown): name is UiComponentName {
  return typeof name === "string" && Object.hasOwn(componentProps, name);
}
