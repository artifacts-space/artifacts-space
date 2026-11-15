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

/** A narrow interface never shows more columns than a wide one. Reads `columns` and `narrowColumns` only, as written. */
export const gridCheck = (props: Record<string, unknown>): string[] => {
  const { columns = 2, narrowColumns } = props;
  if (typeof columns !== "number" || typeof narrowColumns !== "number" || narrowColumns <= columns) return [];
  return [`\`narrowColumns\` (${String(narrowColumns)}) is more than \`columns\` (${String(columns)}): a narrow interface never shows more columns than a wide one. Lower it, or raise \`columns\`.`];
};

/** Components whose children map one to one onto an array prop. */
export const pairedChildren = {
  Tabs: "tabs",
  Accordion: "items",
} as const;
