import { z } from "zod";

import type { PropCheck } from "./data";
import { label, tone } from "./shared";

/*
 * Display-only pieces of a screen: a row of overlapping avatars, a keyboard
 * shortcut, and a star rating. None of them takes input; each has one name
 * for screen readers, written out in words.
 */

/** Avatar sizes, shared with Avatar. */
export const avatarSize = z.enum(["sm", "md", "lg", "xl"]);

const person = z.object({
  name: label(80),
  /** Up to 3 letters shown instead of the initials of `name`. */
  initials: z.string().trim().min(1).max(3).optional(),
  tone: tone.optional(),
});

export const avatarGroupProps = z.object({
  people: z.array(person).min(1).max(50),
  /** How many circles show before the "+N" count. Default 5. */
  max: z.number().int().min(1).max(10).optional(),
  /** Everyone the group stands for, when `people` lists only some of them. */
  total: z.number().int().min(1).max(1_000_000).optional(),
  size: avatarSize.optional(),
});

export const kbdProps = z.object({
  keys: z.array(z.string().trim().min(1).max(20)).min(1).max(6),
});

export const ratingProps = z.object({
  value: z.number().min(0).max(10),
  /** How many stars. Default 5. */
  max: z.number().int().min(1).max(10).optional(),
  /** Words before the score for screen readers, such as "Average rating". */
  label: label(80).optional(),
  /** Shows the number beside the stars. */
  showValue: z.boolean().optional(),
  size: z.enum(["sm", "md", "lg"]).optional(),
});

export const displayProps = { AvatarGroup: avatarGroupProps, Kbd: kbdProps, Rating: ratingProps };

const groupCount = z.object({ people: z.array(z.unknown()), total: z.number() });

/** `total` counts everyone in the group, so it is at least the number of people listed. */
export const avatarGroupCheck: PropCheck = (props) => {
  const read = groupCount.safeParse(props);
  if (!read.success || read.data.total >= read.data.people.length) return [];
  return [`\`total\` (${String(read.data.total)}) counts everyone in the group, so it cannot be less than the ${String(read.data.people.length)} people listed. Raise it, or leave it out.`];
};

const ratingScore = z.object({ value: z.number(), max: z.number().int().optional() });

/** A rating is whole or half stars, and never more than the stars drawn. Reads only `value` and `max`, as written. */
export const ratingCheck: PropCheck = (props) => {
  const read = ratingScore.safeParse(props);
  if (!read.success) return [];
  const { value, max = 5 } = read.data;
  const problems: string[] = [];
  if (value > max) problems.push(`\`value\` (${String(value)}) is more than \`max\` (${String(max)}) stars. Lower it, or raise \`max\`.`);
  if (!Number.isInteger(value * 2)) problems.push(`\`value\` (${String(value)}) must be a whole or half star, such as 4 or 4.5.`);
  return problems;
};

/** Agent-facing descriptions; the guide is generated from them. */
export const displayDescriptions = {
  AvatarGroup:
    "A row of overlapping round avatars. `people` lists each `name` (with optional `initials`, up to 3 letters, and `tone`); `max` (1-10, default 5) circles show, then a \"+N\" count. Set `total` when `people` lists only some of a larger group (\"Join 2,400 others\"). `size`: sm to xl, as Avatar. Screen readers hear one name for the row, such as \"5 people: Maya Chen, Omar Haddad, and 3 more\".",
  Kbd: "A keyboard shortcut drawn as keys: `keys: [\"⌘\", \"K\"]`. Screen readers hear the keys as words (\"Command K\"). It stands alone; put it in a horizontal Box beside Text to label it.",
  Rating:
    "A star rating to look at, not to set. `value` from 0 to `max` (default 5 stars), in whole or half stars. Screen readers hear \"4.5 out of 5\", after `label` when set (\"Average rating: 4.5 out of 5\"). `showValue` writes the number beside the stars; `size`: sm, md, or lg.",
} as const;
