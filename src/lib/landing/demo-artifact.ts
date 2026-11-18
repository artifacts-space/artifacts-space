/**
 * The web page the landing-page demo's agent saves: a checkout rollout plan
 * as an HTML artifact (kind "html"). Version 1 is what the agent saves
 * first. Version 2 is the same plan after Dana's review, with a hold over
 * the weekend.
 *
 * The landing page does not run the page in the sandbox frame: the hero must
 * stay static, fast, and themed. It draws the page as plain JSX from these
 * facts (`demo-page.tsx`), piece by piece, so the page builds in front of the
 * visitor. `demo-story.test.ts` holds the two versions together.
 */

/** The days of the rollout week, Thursday first. */
export const rampDays = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"] as const;

/** Percent of checkout traffic on v2, per day, in each version of the plan. */
export const ramp = {
  1: [5, 25, 25, 50, 50, 100, 100],
  2: [5, 5, 5, 5, 25, 25, 100],
} as const satisfies Record<number, readonly number[]>;

export type PlanVersion = keyof typeof ramp;

/** The days version 2 holds at 5%, as indexes into `rampDays` (first and last, inclusive). */
export const holdDays = { first: 1, last: 3 } as const;

export interface PlanCopy {
  /** The page's own headline. */
  title: string;
  /** One line under it. */
  lede: string;
}

/** The headline and lede of each version. */
export const planCopy: Record<PlanVersion, PlanCopy> = {
  1: { title: "All checkout traffic on v2 by Tuesday.", lede: "Four steps in seven days. One flag rolls it back." },
  2: { title: "All checkout traffic on v2 by Wednesday.", lede: "Held at 5% over the weekend, while payments on-call is thin." },
};

export type StepStatus = "done" | "current" | "upcoming";

export interface PlanStep {
  title: string;
  time: string;
  status: StepStatus;
  note?: string;
}

/** The rollout steps of each version. */
export const planSteps: Record<PlanVersion, readonly PlanStep[]> = {
  1: [
    { title: "5% of traffic", time: "Thu", status: "done" },
    { title: "25% of traffic", time: "Fri", status: "current" },
    { title: "50% of traffic", time: "Sun", status: "upcoming" },
    { title: "100% of traffic", time: "Tue", status: "upcoming" },
  ],
  2: [
    { title: "5% of traffic", time: "Thu", status: "done" },
    { title: "Hold at 5%", time: "Fri to Sun", status: "current", note: "On-call is thin until Monday." },
    { title: "25% of traffic", time: "Mon", status: "upcoming" },
    { title: "100% of traffic", time: "Wed", status: "upcoming" },
  ],
};

export interface PlanStat {
  label: string;
  value: string;
  /** A short line under the value, on wider pages. */
  detail: string;
  /** Recent readings, oldest first, for the sparkline (0 to 100). */
  trend: readonly number[];
  /** Whether the number is good news, drawn in the success tone. */
  good?: boolean;
}

/** The live numbers at the top of the page. They do not change between versions. */
export const planStats: readonly PlanStat[] = [
  { label: "On v2", value: "5%", detail: "of checkout traffic", trend: [0, 0, 5, 5, 5, 5] },
  { label: "Errors", value: "0.21%", detail: "target under 0.5%", trend: [40, 34, 38, 30, 28, 26] },
  { label: "Conversion", value: "+1.8%", detail: "against v1", trend: [20, 30, 26, 44, 52, 60], good: true },
];

/**
 * The first characters of the page's source, as the terminal prints the
 * `content` argument. An HTML artifact is a full page, so it starts with
 * the doctype.
 */
export const pageSourceStart = '<!doctype html><html lang="en">…';

/**
 * The traffic line of one version as SVG path data, in a 0 to 100 box: a
 * step per day, 100 at the top. `closed` returns the filled area under it.
 */
export function rampPath(version: PlanVersion, closed = false): string {
  const values = ramp[version];
  const step = 100 / values.length;
  const points = values.flatMap((value, index) => [`${String(index * step)},${String(100 - value)}`, `${String((index + 1) * step)},${String(100 - value)}`]);
  const line = `M${points.join("L")}`;
  return closed ? `${line}L100,100L0,100Z` : line;
}

/** A sparkline's points in a 0 to 100 box, for an SVG polyline. */
export function trendPoints(trend: readonly number[]): string {
  const gap = 100 / Math.max(trend.length - 1, 1);
  return trend.map((value, index) => `${String(Math.round(index * gap * 100) / 100)},${String(100 - value)}`).join(" ");
}
