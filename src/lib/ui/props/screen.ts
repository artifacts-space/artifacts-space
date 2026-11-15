import { z } from "zod";

import { blockHues } from "@/lib/block-colors/block-color-rules";

import { brandUiIconNames, plainUiIconNames, uiIconNames } from "../icon-names";

import type { PropCheck } from "./data";
import { aspectRatio, containerStep, label, radius, space } from "./shared";

/**
 * Props for the pieces a screen is drawn with: a free-layout Box, icons, and
 * image stand-ins. Every style prop is a named step on a scale, never a CSS
 * value, so a spec cannot carry its own colors or sizes.
 */

/** What a Box is painted with. Hues are the block colors; each surface brings a text color that reads on it. */
export const boxSurfaces = ["none", "page", "card", "muted", "inverse", "primary", ...blockHues] as const;
export type BoxSurface = (typeof boxSurfaces)[number];

/** An icon by name. The message names a few; the guide lists all of them. */
export const iconName = z.enum(uiIconNames, "Use an icon name from the Icon component's list, such as check, arrow-right, star, or mail.");

/** Text color for Icon and Text: the default, muted, a status tone, or the accent (the theme's, or blue on the default palette). */
export const inkTone = z.enum(["default", "muted", "info", "success", "warning", "danger", "accent"]);
export type InkTone = z.infer<typeof inkTone>;

export const boxProps = z.object({
  direction: z.enum(["vertical", "horizontal"]).optional(),
  gap: space.optional(),
  padding: space.optional(),
  paddingX: space.optional(),
  paddingY: space.optional(),
  align: z.enum(["start", "center", "end", "stretch"]).optional(),
  justify: z.enum(["start", "center", "end", "between"]).optional(),
  wrap: z.boolean().optional(),
  grow: z.boolean().optional(),
  width: z.enum(["auto", "full"]).optional(),
  maxWidth: z.enum(["xs", "sm", "md", "lg", "xl", "2xl"]).optional(),
  minHeight: z.enum(["sm", "md", "lg", "xl"]).optional(),
  surface: z.enum(boxSurfaces).optional(),
  border: z.enum(["none", "all", "top", "bottom", "start", "end", "x", "y"]).optional(),
  radius: radius.optional(),
  shadow: z.enum(["none", "sm", "md", "lg"]).optional(),
  overflow: z.enum(["visible", "hidden", "scroll"]).optional(),
  stackBelow: containerStep.optional(),
  alignBelow: z.enum(["start", "center", "end", "stretch"]).optional(),
  reverseBelow: z.boolean().optional(),
  hideBelow: containerStep.optional(),
  hideAbove: containerStep.optional(),
  label: label(120).optional(),
});

export const iconProps = z.object({
  name: iconName,
  size: z.enum(["xs", "sm", "md", "lg", "xl"]).optional(),
  tone: inkTone.optional(),
  label: label(80).optional(),
});

export const placeholderProps = z.object({
  variant: z.enum(["image", "logo", "video", "map", "avatar"]).optional(),
  label: label(80).optional(),
  ratio: aspectRatio.optional(),
  radius: radius.optional(),
  frame: z.enum(["none", "browser", "phone"]).optional(),
});

const stepOrder = { sm: 1, md: 2, lg: 3 } as const;

/*
 * Each rule reads only the props it is about, parsed on their own, so it
 * still runs when an unrelated prop is invalid and a spec's problems are all
 * reported at once. A rule says nothing when one of its own props is not
 * valid (or is an expression): that prop's own error covers it.
 */
const stackFields = boxProps.pick({ direction: true, stackBelow: true });
const stackedFields = boxProps.pick({ direction: true, stackBelow: true, alignBelow: true, reverseBelow: true });
const hideFields = boxProps.pick({ hideBelow: true, hideAbove: true });
const scrollRowFields = boxProps.pick({ overflow: true, direction: true });
const scrollWrapFields = boxProps.pick({ overflow: true, wrap: true });

function stackProblems(props: Record<string, unknown>): string[] {
  const read = stackFields.safeParse(props);
  if (!read.success || !read.data.stackBelow || read.data.direction === "horizontal") return [];
  return ['`stackBelow` only applies to a Box with `direction: "horizontal"`. Set the direction, or remove `stackBelow`.'];
}

/** `alignBelow` and `reverseBelow` say how a row looks once it has stacked, so they need a row that stacks. */
function stackedProblems(props: Record<string, unknown>): string[] {
  const read = stackedFields.safeParse(props);
  if (!read.success) return [];
  const { direction, stackBelow, alignBelow, reverseBelow } = read.data;
  if (direction === "horizontal" && stackBelow) return [];
  const used = [alignBelow === undefined ? null : "alignBelow", reverseBelow ? "reverseBelow" : null].filter((name) => name !== null);
  return used.map((name) => `\`${name}\` only applies to a row that stacks: a Box with \`direction: "horizontal"\` and \`stackBelow\`. Set both, or remove \`${name}\`.`);
}

function hideProblems(props: Record<string, unknown>): string[] {
  const read = hideFields.safeParse(props);
  if (!read.success) return [];
  const { hideBelow, hideAbove } = read.data;
  if (!hideBelow || !hideAbove || stepOrder[hideAbove] > stepOrder[hideBelow]) return [];
  return [`\`hideBelow: "${hideBelow}"\` with \`hideAbove: "${hideAbove}"\` hides the Box at every width. Make \`hideAbove\` a wider step than \`hideBelow\`, or remove one.`];
}

function scrollProblems(props: Record<string, unknown>): string[] {
  const row = scrollRowFields.safeParse(props);
  const wrap = scrollWrapFields.safeParse(props);
  const problems: string[] = [];
  if (row.success && row.data.overflow === "scroll" && row.data.direction !== "horizontal") {
    problems.push('`overflow: "scroll"` scrolls a row sideways. Set `direction: "horizontal"`, or remove `overflow`.');
  }
  if (wrap.success && wrap.data.overflow === "scroll" && wrap.data.wrap) {
    problems.push('`overflow: "scroll"` and `wrap` cannot both apply: a row that wraps never scrolls. Remove one.');
  }
  return problems;
}

const frameFields = placeholderProps.pick({ variant: true, frame: true });

/**
 * A frame is drawn around a picture-sized stand-in; a logo or an avatar is
 * too small to sit in a window or a phone. Like the Box rules, it says
 * nothing unless both props are valid as written: an expression is only
 * known once it resolves, and an invalid value has its own error.
 */
export const placeholderCheck: PropCheck = (props) => {
  const read = frameFields.safeParse(props);
  if (!read.success) return [];
  const { variant, frame } = read.data;
  if (frame !== "browser" && frame !== "phone") return [];
  if (variant !== "logo" && variant !== "avatar") return [];
  return [`\`frame\` applies to an image, video, or map Placeholder. Remove \`frame\`, or change \`variant: "${variant}"\`.`];
};

/** A Box that can never show, or a rule that cannot apply to it, is a mistake worth naming. */
export const boxCheck: PropCheck = (props) => [...stackProblems(props), ...stackedProblems(props), ...hideProblems(props), ...scrollProblems(props)];

/** Agent-facing descriptions; the guide is generated from them. */
export const screenDescriptions = {
  Box:
    "A free-layout container for drawing screens. Children stack vertically or sit in a row (`direction`), with `gap`, `padding` (`paddingX` / `paddingY` override one axis), `align` (across the direction), `justify` (along it), `wrap`, `grow` (take the free room in a row), `width`, `maxWidth` (xs 320, sm 384, md 576, lg 768, xl 1024, 2xl 1280 pixels; center it with `align: \"center\"` on the parent) and `minHeight`. `surface` paints it and sets a text color that reads on it: none, page, card, muted, a hue (gray, brown, orange, yellow, green, blue, purple, pink, red), or inverse and primary, which switch everything inside to a contrasting palette and do not nest. `border` (all, top, bottom, start, end, x, y), `radius`, and `shadow` finish it. `overflow`: hidden clips children to the radius; scroll makes a row scroll sideways instead of wrapping (set `label` to name it). Responsive props follow the width of the page column or canvas frame, never the browser window (sm 576, md 672, lg 896 pixels): `stackBelow` turns a row into a column below that width; on such a row, `alignBelow` (start, center, end, stretch) is the `align` to use once it has stacked, so `align: \"center\"` on the row does not shrink each stacked child to its content, and `reverseBelow` draws the stacked children in reverse order (words above a picture that sits first in the row; keyboard and reading order stay as written, so do not use it across buttons, links, or fields). `hideBelow` and `hideAbove` hide the Box. `label` names it for screen readers.",
  Icon: `An icon by name, in the text color. \`size\`: xs to xl. \`tone\`: default, muted, or a status tone. Decorative unless \`label\` is set. Names: ${plainUiIconNames.join(", ")}. Brand marks, outline only and in the text color, for social links and sign-in buttons (an icon-only Button or Link with one needs a \`label\` naming the network, such as "GitHub"): ${brandUiIconNames.join(", ")}.`,
  Placeholder: "A neutral stand-in so a mockup needs no upload. `variant`: image (default), video, or map fill the width at `ratio` (square, photo 4:3, video 16:9, wide 21:9, portrait 3:4); logo is a small wordmark box; avatar is a small circle. `label` says what goes there. `frame`: browser or phone draws a plain window or phone around an image, video, or map stand-in, for a product shot; the frame is decoration with no working controls.",
} as const;
