import { z } from "zod";

import { boxProps } from "./screen";
import { gap, label, prose } from "./shared";

/** Props for layout components. Children come from the element's `children`. */
export const layoutProps = {
  Section: z.object({
    title: label(160).optional(),
    description: prose(600).optional(),
  }),
  Stack: z.object({
    direction: z.enum(["vertical", "horizontal"]).optional(),
    gap: gap.optional(),
    align: z.enum(["start", "center", "end", "stretch"]).optional(),
  }),
  Grid: z.object({
    columns: z.number().int().min(1).max(4).optional(),
    /** Columns where the interface is narrow (a phone, below 576 pixels). Default 1. */
    narrowColumns: z.number().int().min(1).max(2).optional(),
    /** How many columns each child spans, one entry per child in order. Without it every child spans one. */
    spans: z.array(z.number().int().min(1).max(4)).max(200).optional(),
    gap: gap.optional(),
  }),
  Card: z.object({
    title: label(160).optional(),
    description: prose(600).optional(),
  }),
  Tabs: z.object({
    tabs: z.array(z.object({ label: label(60) })).min(1).max(12),
    defaultIndex: z.number().int().min(0).max(11).optional(),
  }),
  Accordion: z.object({
    items: z.array(z.object({ title: label(160) })).min(1).max(50),
    openFirst: z.boolean().optional(),
  }),
  Separator: z.object({
    label: label(60).optional(),
    orientation: z.enum(["horizontal", "vertical"]).optional(),
  }),
  Box: boxProps,
};

/** A vertical rule is a line between two items in a row: it has no room for words. */
export const separatorCheck = (props: Record<string, unknown>): string[] =>
  props.orientation === "vertical" && typeof props.label === "string" && props.label.trim() !== ""
    ? ['`label` applies to a horizontal Separator. Remove `label`, or remove `orientation: "vertical"`.']
    : [];

/** A narrow interface never shows more columns than a wide one. */
function narrowProblem(columns: number, narrowColumns: unknown): string[] {
  if (typeof narrowColumns !== "number" || narrowColumns <= columns) return [];
  return [`\`narrowColumns\` (${String(narrowColumns)}) is more than \`columns\` (${String(columns)}): a narrow interface never shows more columns than a wide one. Lower it, or raise \`columns\`.`];
}

/** No child spans more columns than the grid has. */
function spanProblem(columns: number, spans: unknown): string[] {
  if (!Array.isArray(spans)) return [];
  const wide = spans.flatMap((span: unknown, index) => (typeof span === "number" && span > columns ? [`#${String(index + 1)} (${String(span)})`] : []));
  if (wide.length === 0) return [];
  return [`\`spans\` ${wide.join(", ")} ${wide.length === 1 ? "is" : "are"} more than \`columns\` (${String(columns)}): a child spans at most every column. Lower ${wide.length === 1 ? "it" : "them"}, or raise \`columns\`.`];
}

/** How many columns a Grid has when `columns` is not set. */
export const defaultGridColumns = 2;

/**
 * Grid rules on `columns`, `narrowColumns`, and `spans`, as written: each
 * is read only when it is a number (or a list), so an expression gets no
 * message here.
 */
export const gridCheck = (props: Record<string, unknown>): string[] => {
  const { columns = defaultGridColumns } = props;
  if (typeof columns !== "number") return [];
  return [...narrowProblem(columns, props.narrowColumns), ...spanProblem(columns, props.spans)];
};

/**
 * Components whose children map one to one onto an array prop. Tabs and
 * Accordion always have theirs; a Grid's `spans` is optional, and when it is
 * set it has one entry per child too.
 */
export const pairedChildren = {
  Tabs: "tabs",
  Accordion: "items",
  Grid: "spans",
} as const;

/** True when `type` pairs its children with an array prop. */
export function isPairedType(type: string | undefined): type is keyof typeof pairedChildren {
  return type !== undefined && Object.hasOwn(pairedChildren, type);
}
