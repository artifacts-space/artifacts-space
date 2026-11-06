import { z } from "zod";

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
  }),
};

/** Components whose children map one to one onto an array prop. */
export const pairedChildren = {
  Tabs: "tabs",
  Accordion: "items",
} as const;
