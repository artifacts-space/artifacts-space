import { z } from "zod";

import { isSafeHref, maxHrefLength } from "@/lib/link-policy";

import { isExpression } from "../expressions";

import type { PropCheck } from "./data";
import { avatarGroupCheck, displayProps, ratingCheck } from "./display";
import { avatarProps } from "./fields";
import { iconName, iconProps, inkTone } from "./screen";
import { badgeTones, label, prose, textAlign, tone } from "./shared";

const stepItem = z.object({
  title: label(160),
  body: prose(5000).optional(),
  code: prose(10_000).optional(),
  language: label(40).optional(),
});

/** Props for text and content components. */
export const contentProps = {
  Heading: z.object({
    text: label(200),
    level: z.number().int().min(1).max(4).optional(),
    size: z.enum(["sm", "md", "lg", "xl", "2xl", "display"]).optional(),
    align: textAlign.optional(),
  }),
  Text: z.object({
    text: prose(5000),
    variant: z.enum(["body", "eyebrow", "caption", "mono"]).optional(),
    tone: inkTone.optional(),
    size: z.enum(["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]).optional(),
    weight: z.enum(["normal", "medium", "semibold"]).optional(),
    align: textAlign.optional(),
    clamp: z.number().int().min(1).max(3).optional(),
    announce: z.boolean().optional(),
  }),
  Markdown: z.object({
    content: prose(20_000),
  }),
  Code: z.object({
    code: prose(20_000),
    language: label(40).optional(),
    title: label(160).optional(),
  }),
  Callout: z.object({
    text: prose(2000),
    title: label(160).optional(),
    tone: tone.optional(),
    announce: z.boolean().optional(),
  }),
  Badge: z.object({
    label: label(60),
    tone: badgeTones.optional(),
    variant: z.enum(["soft", "solid", "outline"]).optional(),
    icon: iconName.optional(),
    /** A status dot in the tone: before the label, or alone with the label read by screen readers only. */
    dot: z.enum(["start", "only"]).optional(),
  }),
  List: z.object({
    items: z.array(prose(1000)).max(200),
    ordered: z.boolean().optional(),
    marker: z.enum(["dot", "check", "cross", "arrow"]).optional(),
  }),
  Steps: z.object({
    items: z.array(stepItem).max(50),
    title: label(160).optional(),
  }),
  Link: z.object({
    label: label(200),
    href: z
      .string()
      .max(maxHrefLength)
      .refine(isSafeHref, "Use an absolute http, https, or mailto URL, or leave `href` out for a link that goes nowhere.")
      .optional(),
    variant: z.enum(["inline", "nav", "muted"]).optional(),
    active: z.boolean().optional(),
    icon: iconName.optional(),
    iconPosition: z.enum(["start", "end"]).optional(),
  }),
  Quote: z.object({
    text: prose(2000),
    cite: label(200).optional(),
  }),
  Icon: iconProps,
  Avatar: avatarProps,
  ...displayProps,
};

/** A numbered list has its numbers as markers. */
const listCheck: PropCheck = (props) =>
  props.ordered === true && typeof props.marker === "string" && props.marker !== "dot" ? ["`marker` applies to a bulleted list. Remove `ordered`, or remove `marker`."] : [];

const linkIconFields = z.object({ variant: z.enum(["inline", "nav", "muted"]).optional(), iconPosition: z.enum(["start", "end"]).optional() });

/**
 * An inline link with an address already ends with its own mark, the arrow
 * that says it opens a new tab, so it takes an icon at the start only. It
 * reads `variant` and `iconPosition` as written and says nothing while
 * either is an expression, and nothing about a link with no `icon`. The address counts as the view counts it: one
 * the link policy accepts, or one read from state. A refused `href` has its
 * own error and draws no arrow.
 */
export const linkCheck: PropCheck = (props) => {
  const read = linkIconFields.safeParse(props);
  const drawsArrow = isExpression(props.href) || isSafeHref(props.href);
  if (!read.success || !drawsArrow || props.icon === undefined) return [];
  const { variant = "inline", iconPosition } = read.data;
  if (variant !== "inline" || iconPosition !== "end") return [];
  return ['An inline link with an `href` ends with its own arrow, so its icon goes at the start. Set `iconPosition: "start"`, or use `variant: "nav"` or `"muted"`, which have no arrow.'];
};

/**
 * A dot alone draws no pill, so the `icon` and `variant` that style one have
 * nothing to style. Reads `dot`, `icon`, and `variant` as written.
 */
export const badgeCheck: PropCheck = (props) => {
  if (props.dot !== "only") return [];
  const unused = ["icon", "variant"].filter((name) => props[name] !== undefined);
  if (unused.length === 0) return [];
  const names = unused.map((name) => `\`${name}\``).join(" and ");
  return [`${names} ${unused.length === 1 ? "styles" : "style"} a badge with its label on screen, and a dot alone (\`dot: "only"\`) draws no label. Remove ${unused.length === 1 ? "it" : "them"}, or use \`dot: "start"\`.`];
};

/** Cross-field rules for content components. */
export const contentChecks: Partial<Record<keyof typeof contentProps, PropCheck>> = { List: listCheck, Link: linkCheck, Badge: badgeCheck, AvatarGroup: avatarGroupCheck, Rating: ratingCheck };
