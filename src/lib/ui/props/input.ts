import { z } from "zod";

import type { PropCheck } from "./data";
import { finiteNumber, label, prose } from "./shared";

/**
 * Props for input components. Inputs only change the spec's own state, through
 * `$bindState` bindings and the built-in state actions. They never send data anywhere.
 */
export const inputProps = {
  Checklist: z.object({
    title: label(160).optional(),
    items: z.array(z.object({ label: prose(300), checked: z.boolean().optional() })).max(100),
  }),
  Checkbox: z.object({
    label: label(200),
    checked: z.boolean().optional(),
    description: prose(400).optional(),
  }),
  Select: z.object({
    label: label(120),
    options: z.array(label(120)).min(1).max(100),
    value: label(120).optional(),
    placeholder: label(80).optional(),
  }),
  Switch: z.object({
    label: label(200),
    checked: z.boolean().optional(),
    description: prose(400).optional(),
  }),
  Slider: z.object({
    label: label(120),
    min: finiteNumber().optional(),
    max: finiteNumber().optional(),
    step: finiteNumber().positive().optional(),
    value: finiteNumber().optional(),
  }),
  Button: z.object({
    label: label(60),
    variant: z.enum(["default", "outline", "secondary", "ghost"]).optional(),
  }),
};

function sliderCheck(props: Record<string, unknown>): string[] {
  const parsed = inputProps.Slider.safeParse(props);
  if (!parsed.success) return [];
  const { min = 0, max = 100 } = parsed.data;
  return min < max ? [] : [`min (${min}) must be less than max (${max}).`];
}

/** Cross-field rules for input components. */
export const inputChecks: Partial<Record<keyof typeof inputProps, PropCheck>> = {
  Slider: sliderCheck,
};

/** Events each input component can emit, for `on` bindings. */
export const inputEvents = {
  Button: ["press"],
  Checkbox: ["change"],
  Select: ["change"],
  Switch: ["change"],
  Slider: ["change"],
} as const;
