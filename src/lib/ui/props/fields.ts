import { z } from "zod";

import type { PropCheck } from "./data";
import { label, prose, tone } from "./shared";

/**
 * Props for text fields and avatars. A field only changes the page's own
 * state: nothing a reader types is ever sent. A password field is a
 * stand-in that cannot be typed into at all, so no agent-drawn form ever
 * holds a real secret.
 */

/** What every labelled field shares. `error` marks the field invalid and shows the message under it. */
export const fieldBase = {
  description: prose(400).optional(),
  error: prose(300).optional(),
  hideLabel: z.boolean().optional(),
  disabled: z.boolean().optional(),
};

export const inputFieldProps = z.object({
  label: label(120),
  type: z.enum(["text", "email", "search", "number", "password"]).optional(),
  placeholder: label(120).optional(),
  value: z.string().max(500).optional(),
  fullWidth: z.boolean().optional(),
  ...fieldBase,
});

export const textareaProps = z.object({
  label: label(120),
  placeholder: label(120).optional(),
  value: prose(5000).optional(),
  rows: z.number().int().min(2).max(12).optional(),
  fullWidth: z.boolean().optional(),
  ...fieldBase,
});

export const avatarProps = z.object({
  name: label(80),
  size: z.enum(["sm", "md", "lg", "xl"]).optional(),
  tone: tone.optional(),
});

/**
 * A password field is drawn, never real: its type is written in the spec so
 * it cannot turn into one after a reader has typed, and it takes no value
 * and no binding, so there is nothing to read back from it.
 */
export const inputCheck: PropCheck = (props) => {
  // Reads `type` and `value` only, so it runs beside any other prop's error.
  if (props.type !== undefined && typeof props.type !== "string") {
    return ["`type` must be written in the spec (text, email, search, number, or password), not read from state with an expression."];
  }
  if (props.type === "password" && props.value !== undefined) {
    return ['A password Input is a stand-in that cannot be typed into: it takes no `value` and cannot be bound with `$bindState`. Remove `value`, or use `type: "text"` for a field a reader can type in.'];
  }
  return [];
};

/** Agent-facing descriptions; the guide is generated from them. */
export const fieldDescriptions = {
  Input:
    "A one-line text field. `type`: text (default), email, search, number, or password. Bind `value` with { \"$bindState\": \"/path\" }; it only changes on-page state and nothing is ever sent. A password field is a stand-in: it shows dots, cannot be typed into, and takes no `value`. `description` and `error` show under the field; `hideLabel` keeps the label for screen readers only; `fullWidth` fills the container.",
  Textarea: "A multi-line text field with `rows` (2-12). Bind `value` with { \"$bindState\": \"/path\" }; it only changes on-page state and nothing is ever sent. Takes `description`, `error`, `hideLabel`, `disabled`, and `fullWidth` like Input.",
  Avatar: "A round avatar with the initials of `name`, which also names it for screen readers. `size`: sm to xl. `tone` tints it.",
} as const;
