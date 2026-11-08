import { z } from "zod";

import { componentProps, type UiComponentName } from "./catalog";
import type { RawElement } from "./spec-blocks";

/**
 * The blocks a person can add to an interface from "/" or "+": each starts
 * as a small valid element (with child blocks where the component needs
 * them), ready to type into. Image and File need an upload first, so they
 * are not offered here.
 */

/** How the insert menu groups blocks. */
export type BlockGroup = "Text" | "Layout" | "Data" | "Planning" | "Inputs";

/** One entry in the insert menu. */
export interface BlockTemplate {
  /** Stable id for the menu; several entries may share a component type. */
  id: string;
  type: UiComponentName;
  label: string;
  group: BlockGroup;
  /** Extra words the menu filter matches, such as "h1" or "title". */
  keywords: readonly string[];
  /** The new element, and its child blocks in order. */
  create: () => { element: RawElement; children?: RawElement[] };
}

const text = (value: string): RawElement => ({ type: "Text", props: { text: value } });

function block(type: UiComponentName, props: Record<string, unknown>, children?: RawElement[]) {
  return () => (children ? { element: { type, props }, children: children.map((child) => structuredClone(child)) } : { element: { type, props } });
}

/** Every block the insert menu offers, in menu order. */
export const blockTemplates: readonly BlockTemplate[] = [
  { id: "text", type: "Text", label: "Text", group: "Text", keywords: ["paragraph", "plain"], create: block("Text", { text: "" }) },
  { id: "heading-1", type: "Heading", label: "Heading 1", group: "Text", keywords: ["h1", "title"], create: block("Heading", { text: "Heading", level: 1 }) },
  { id: "heading-2", type: "Heading", label: "Heading 2", group: "Text", keywords: ["h2", "subtitle"], create: block("Heading", { text: "Heading", level: 2 }) },
  { id: "heading-3", type: "Heading", label: "Heading 3", group: "Text", keywords: ["h3"], create: block("Heading", { text: "Heading", level: 3 }) },
  { id: "markdown", type: "Markdown", label: "Markdown", group: "Text", keywords: ["rich", "formatted", "md"], create: block("Markdown", { content: "Write in **Markdown**." }) },
  { id: "list", type: "List", label: "Bulleted list", group: "Text", keywords: ["bullets", "ul"], create: block("List", { items: ["First item"] }) },
  { id: "numbered-list", type: "List", label: "Numbered list", group: "Text", keywords: ["ordered", "ol"], create: block("List", { items: ["First item"], ordered: true }) },
  { id: "quote", type: "Quote", label: "Quote", group: "Text", keywords: ["blockquote", "citation"], create: block("Quote", { text: "Quote" }) },
  { id: "callout", type: "Callout", label: "Callout", group: "Text", keywords: ["note", "tip", "warning", "info"], create: block("Callout", { text: "Note", tone: "info" }) },
  { id: "code", type: "Code", label: "Code", group: "Text", keywords: ["snippet", "source"], create: block("Code", { code: "" }) },
  { id: "badge", type: "Badge", label: "Badge", group: "Text", keywords: ["status", "tag", "label"], create: block("Badge", { label: "Status" }) },
  { id: "link", type: "Link", label: "Link", group: "Text", keywords: ["url", "href"], create: block("Link", { label: "Link", href: "https://example.com" }) },
  { id: "separator", type: "Separator", label: "Divider", group: "Text", keywords: ["separator", "rule", "hr", "line"], create: block("Separator", {}) },
  { id: "section", type: "Section", label: "Section", group: "Layout", keywords: ["group", "region"], create: block("Section", { title: "Section" }, [text("")]) },
  { id: "card", type: "Card", label: "Card", group: "Layout", keywords: ["box", "panel"], create: block("Card", { title: "Card" }, [text("")]) },
  { id: "columns", type: "Grid", label: "Columns", group: "Layout", keywords: ["grid", "side by side"], create: block("Grid", { columns: 2 }, [text(""), text("")]) },
  { id: "row", type: "Stack", label: "Row", group: "Layout", keywords: ["stack", "horizontal", "inline"], create: block("Stack", { direction: "horizontal" }, [text("")]) },
  { id: "tabs", type: "Tabs", label: "Tabs", group: "Layout", keywords: ["tabbed", "panels"], create: block("Tabs", { tabs: [{ label: "First" }, { label: "Second" }] }, [text(""), text("")]) },
  { id: "accordion", type: "Accordion", label: "Accordion", group: "Layout", keywords: ["toggle", "collapse", "faq"], create: block("Accordion", { items: [{ title: "Question" }] }, [text("")]) },
  { id: "table", type: "Table", label: "Table", group: "Data", keywords: ["rows", "columns", "spreadsheet"], create: block("Table", { columns: [{ key: "name", label: "Name" }, { key: "value", label: "Value", format: "number" }], rows: [{ name: "First", value: 1 }] }) },
  { id: "chart", type: "Chart", label: "Chart", group: "Data", keywords: ["graph", "bar", "line", "pie", "plot"], create: block("Chart", { type: "bar", labels: ["Q1", "Q2", "Q3"], series: [{ name: "Series 1", values: [3, 5, 4] }] }) },
  { id: "metric", type: "Metric", label: "Metric", group: "Data", keywords: ["kpi", "number", "stat"], create: block("Metric", { label: "Metric", value: 0 }) },
  { id: "key-value", type: "KeyValue", label: "Key-value list", group: "Data", keywords: ["properties", "details", "specs"], create: block("KeyValue", { items: [{ label: "Label", value: "Value" }] }) },
  { id: "progress", type: "Progress", label: "Progress", group: "Data", keywords: ["bar", "percent", "completion"], create: block("Progress", { value: 50, label: "Progress" }) },
  { id: "timeline", type: "Timeline", label: "Timeline", group: "Data", keywords: ["events", "history", "milestones"], create: block("Timeline", { items: [{ title: "Milestone", status: "current" }] }) },
  { id: "diagram", type: "Diagram", label: "Diagram", group: "Data", keywords: ["mermaid", "flowchart", "sequence"], create: block("Diagram", { code: "flowchart LR\n  A[Start] --> B[Finish]" }) },
  { id: "steps", type: "Steps", label: "Steps", group: "Planning", keywords: ["how-to", "runbook", "instructions"], create: block("Steps", { items: [{ title: "First step" }] }) },
  { id: "checklist", type: "Checklist", label: "Checklist", group: "Planning", keywords: ["todo", "tasks"], create: block("Checklist", { items: [{ label: "First task" }] }) },
  { id: "board", type: "Board", label: "Board", group: "Planning", keywords: ["kanban", "columns", "cards"], create: block("Board", { columns: [{ title: "To do", cards: [{ title: "First card" }] }, { title: "Done", cards: [] }] }) },
  { id: "calendar", type: "Calendar", label: "Calendar", group: "Planning", keywords: ["events", "schedule", "agenda"], create: block("Calendar", { events: [] }) },
  { id: "checkbox", type: "Checkbox", label: "Checkbox", group: "Inputs", keywords: ["tick"], create: block("Checkbox", { label: "Checkbox" }) },
  { id: "select", type: "Select", label: "Dropdown", group: "Inputs", keywords: ["select", "options", "menu"], create: block("Select", { label: "Choose one", options: ["First", "Second"] }) },
  { id: "switch", type: "Switch", label: "Switch", group: "Inputs", keywords: ["toggle", "on off"], create: block("Switch", { label: "Switch" }) },
  { id: "slider", type: "Slider", label: "Slider", group: "Inputs", keywords: ["range"], create: block("Slider", { label: "Amount" }) },
  { id: "button", type: "Button", label: "Button", group: "Inputs", keywords: ["action"], create: block("Button", { label: "Button" }) },
];

/** The menu entries matching what was typed after "/", best matches first; all of them for an empty query. */
export function matchTemplates(query: string): BlockTemplate[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...blockTemplates];
  const starts: BlockTemplate[] = [];
  const contains: BlockTemplate[] = [];
  for (const template of blockTemplates) {
    const words = [template.label.toLowerCase(), ...template.keywords];
    if (words.some((word) => word.startsWith(needle))) starts.push(template);
    else if (words.some((word) => word.includes(needle))) contains.push(template);
  }
  return [...starts, ...contains];
}

/**
 * The longest text a component's string prop takes (its zod `max`), or
 * undefined when it has none. The editor stops typing at this length, so a
 * block never turns into an error notice under the cursor.
 */
export function textLimit(type: UiComponentName, prop: string): number | undefined {
  const shape: Record<string, z.ZodType> = componentProps[type].shape;
  const field = shape[prop];
  const inner = field instanceof z.ZodOptional ? field.unwrap() : field;
  return inner instanceof z.ZodString ? (inner.maxLength ?? undefined) : undefined;
}
