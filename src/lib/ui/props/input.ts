import { z } from "zod";

import type { PropCheck } from "./data";
import { fieldBase, inputCheck, inputFieldProps, textareaProps } from "./fields";
import { iconName } from "./screen";
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
    fullWidth: z.boolean().optional(),
    ...fieldBase,
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
    variant: z.enum(["default", "outline", "secondary", "ghost", "danger"]).optional(),
    size: z.enum(["sm", "md", "lg"]).optional(),
    fullWidth: z.boolean().optional(),
    icon: iconName.optional(),
    iconPosition: z.enum(["start", "end"]).optional(),
    iconOnly: z.boolean().optional(),
    disabled: z.boolean().optional(),
    expanded: z.boolean().optional(),
    pressed: z.boolean().optional(),
  }),
  Input: inputFieldProps,
  Textarea: textareaProps,
};

/** A button that shows only an icon still needs one to show; its label then names it for screen readers. */
function iconOnlyProblems(props: Record<string, unknown>): string[] {
  return props.iconOnly === true && props.icon === undefined ? ["`iconOnly` needs an `icon`. Set `icon` to an icon name, or remove `iconOnly`. The `label` then names the button for screen readers."] : [];
}

/**
 * `pressed` is a toggle that stays on (Bold, a filter chip), and `expanded`
 * a button that opens a panel: two different widgets, so a button is one or
 * the other. A danger button is a one-time action that deletes or cannot be
 * undone, so it never stays pressed, and the pressed fill would hide its
 * warning color. Both read the props as written: `pressed` set in any form,
 * expression included, counts, and so does `variant` written as "danger".
 */
function pressedProblems(props: Record<string, unknown>): string[] {
  if (props.pressed === undefined) return [];
  const problems: string[] = [];
  if (props.expanded !== undefined) problems.push("`pressed` and `expanded` describe different buttons: `pressed` a toggle that stays on, such as Bold, and `expanded` a button that opens a panel, such as a menu. Keep `pressed` for a toggle, or `expanded` for a button that opens something.");
  if (props.variant === "danger") problems.push("A danger Button is a one-time action that deletes or cannot be undone, so it cannot stay pressed, and the pressed look would hide its warning color. Remove `pressed`, or use the default, outline, secondary, or ghost variant for a toggle.");
  return problems;
}

function buttonCheck(props: Record<string, unknown>): string[] {
  return [...iconOnlyProblems(props), ...pressedProblems(props)];
}

function sliderCheck(props: Record<string, unknown>): string[] {
  const parsed = inputProps.Slider.safeParse(props);
  if (!parsed.success) return [];
  const { min = 0, max = 100 } = parsed.data;
  return min < max ? [] : [`min (${min}) must be less than max (${max}).`];
}

/** Cross-field rules for input components. */
export const inputChecks: Partial<Record<keyof typeof inputProps, PropCheck>> = {
  Slider: sliderCheck,
  Button: buttonCheck,
  Input: inputCheck,
};

/** Events each input component can emit, for `on` bindings. */
export const inputEvents = {
  Button: ["press"],
  Input: ["change"],
  Textarea: ["change"],
  Checkbox: ["change"],
  Select: ["change"],
  Switch: ["change"],
  Slider: ["change"],
} as const;
