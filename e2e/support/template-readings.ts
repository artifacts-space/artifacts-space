import { templateFrameWidths, type TemplateFrameWidth } from "../../src/lib/ui/templates/frames";
import type { TemplateViewport } from "../../src/lib/ui/templates/types";

import type { LabelCounts } from "./template-frames";

/*
 * Where the templates behavior spec reads a template, and what it concludes
 * from its readings. Pure, so a unit test shows each check can fail, and
 * covers a template made for one end only before the first one ships
 * (template-readings.test.ts).
 */

/** One reading of a template: the width it is read at, and the frame it is read in. They differ when a frame is made narrower for the reading. */
export interface WidthReading {
  width: number;
  frame: TemplateFrameWidth;
}

/** Where a template is read: the frames the page draws for its viewport, and every reading, both from wide to narrow. */
export interface ReadingPlan {
  frames: readonly TemplateFrameWidth[];
  reads: readonly WidthReading[];
}

/** The reading between two width steps: the tablet frame, made 640 wide. */
const betweenSteps = { frame: 768, width: 640 } as const;

/**
 * Where a template made for `viewport` is read: each frame the page draws
 * for it (templateFrameWidths, the record the page reads), at its own
 * width, and the tablet frame made 640 wide when the template is also drawn
 * narrower than that. A template made for wide frames only is never read
 * below its tablet frame, and one made for a phone is read once.
 */
export function readingPlan(viewport: TemplateViewport): ReadingPlan {
  const frames = [...templateFrameWidths[viewport]].sort((a, b) => b - a);
  const reads: WidthReading[] = frames.map((frame) => ({ width: frame, frame }));
  if (frames.includes(betweenSteps.frame) && Math.min(...frames) < betweenSteps.width) reads.push(betweenSteps);
  return { frames, reads: reads.sort((a, b) => b.width - a.width) };
}

/** The frames a press that nothing undoes is made in: the widest and the narrowest, each once. */
export function endFrames(plan: ReadingPlan): TemplateFrameWidth[] {
  return [...new Set([plan.frames[0], plan.frames.at(-1)])].filter((frame) => frame !== undefined);
}

/** The most times each label was drawn over several readings of one frame: at rest, and after each press that opens something. */
export function mostOf(readings: readonly LabelCounts[]): LabelCounts {
  const most: LabelCounts = { actions: {}, pictures: {} };
  for (const kind of ["actions", "pictures"] as const) {
    for (const reading of readings) {
      for (const [label, count] of Object.entries(reading[kind])) most[kind][label] = Math.max(most[kind][label] ?? 0, count);
    }
  }
  return most;
}

/**
 * Link and button labels a reader reaches in the `wide` frame and never in
 * the `narrow` one, at rest or with a panel open. `allowed` names labels
 * left out on purpose, each with its reason.
 */
export function unreachableIn(narrow: LabelCounts, wide: LabelCounts, allowed: Readonly<Record<string, string>> = {}): string[] {
  return Object.keys(wide.actions).filter((label) => (wide.actions[label] ?? 0) > 0 && (narrow.actions[label] ?? 0) === 0 && allowed[label] === undefined);
}

/**
 * Labels drawn more often in the `middle` frame than in any of the `ends`,
 * each with its count: a part shown twice between two width steps, which is
 * what hide steps that differ produce.
 */
export function drawnMoreThan(middle: LabelCounts, ends: readonly LabelCounts[]): string[] {
  return (["actions", "pictures"] as const).flatMap((kind) =>
    Object.entries(middle[kind])
      .filter(([label, count]) => count > Math.max(0, ...ends.map((end) => end[kind][label] ?? 0)))
      .map(([label, count]) => `"${label}" (${count === 1 ? "once" : `${String(count)} times`})`),
  );
}

const quoted = (labels: readonly string[]) => labels.map((label) => `"${label}"`).join(", ");

/**
 * What the readings of one template show to be wrong, in words. Every
 * reading narrower than the widest must reach what the widest reaches, and
 * every reading between the two ends must draw nothing more often than both
 * ends do. A template read at one width has nothing to compare, and one
 * read at two has no middle. A width the plan names and nobody read is a
 * problem of its own, never a silent pass.
 */
export function widthProblems(plan: ReadingPlan, readings: ReadonlyMap<number, LabelCounts>, leftOut: Readonly<Record<string, string>> = {}): string[] {
  const widths = plan.reads.map((read) => read.width);
  const unread = widths.filter((width) => !readings.has(width));
  if (unread.length > 0) return [`not read at ${unread.join(", ")}`];
  const at = (width: number): LabelCounts => readings.get(width) ?? { actions: {}, pictures: {} };
  const [widest = 0] = widths;
  const narrowest = widths.at(-1) ?? widest;
  const problems: string[] = [];
  for (const width of widths.slice(1)) {
    const missing = unreachableIn(at(width), at(widest), leftOut);
    if (missing.length > 0) problems.push(`at ${String(width)}, a reader cannot reach ${quoted(missing)}, at rest or after opening a panel`);
  }
  for (const width of widths.slice(1, -1)) {
    const twice = drawnMoreThan(at(width), [at(widest), at(narrowest)]);
    if (twice.length > 0) problems.push(`at ${String(width)}, drawn more often than at ${String(narrowest)} or ${String(widest)}: ${twice.join(", ")}`);
  }
  return problems;
}
