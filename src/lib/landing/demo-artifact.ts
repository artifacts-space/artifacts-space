import { UI_SPEC_VERSION } from "@/lib/ui/version";

/**
 * The artifact the landing-page demo builds: a checkout rollout plan as a
 * json-render ui spec. Version 1 is what the agent saves first. Version 2 is
 * the same plan after Dana's review, with a hold over the weekend.
 *
 * The demo draws each piece with the app's own renderer (UiView), one piece
 * at a time, so the page builds in front of the visitor.
 * `demo-story.test.ts` checks that every spec here is a valid ui artifact.
 */

type Element = Record<string, unknown>;

const days = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];

/** Percent of checkout traffic on v2, per day, in each version of the plan. */
const ramp = {
  1: [5, 25, 25, 50, 50, 100, 100],
  2: [5, 5, 5, 5, 25, 50, 100],
} as const;

export type PlanVersion = keyof typeof ramp;

function chart(version: PlanVersion): Element {
  const onV2 = ramp[version];
  return {
    type: "Chart",
    props: {
      type: "bar",
      stacked: true,
      title: "Traffic on checkout v2",
      format: "percent",
      height: "sm",
      labels: days,
      series: [
        { name: "v2", values: [...onV2] },
        { name: "v1", values: onV2.map((value) => 100 - value) },
      ],
    },
  };
}

const firstPlan = [
  { title: "5% of traffic", time: "Thu", status: "done" },
  { title: "25% of traffic", time: "Fri", status: "current" },
  { title: "50% of traffic", time: "Sun", status: "upcoming" },
  { title: "100% of traffic", time: "Tue", status: "upcoming" },
];

const reviewedPlan = [
  { title: "5% of traffic", time: "Thu", status: "done" },
  { title: "Hold at 5% over the weekend", time: "Fri to Sun", status: "current", description: "Payments on-call is thin until Monday." },
  { title: "25% of traffic", time: "Mon", status: "upcoming" },
  { title: "100% of traffic", time: "Wed", status: "upcoming" },
];

function timeline(version: PlanVersion): Element {
  return { type: "Timeline", props: { items: version === 1 ? firstPlan : reviewedPlan } };
}

const board: Element = {
  type: "Board",
  props: {
    title: "Risks",
    columns: [
      {
        title: "To check",
        tone: "warning",
        cards: [{ title: "Card declines go up", badges: [{ label: "Payments", tone: "warning" }], owner: "Dana" }],
      },
      { title: "Done", tone: "success", cards: [{ title: "Load test at 2x peak", badges: [{ label: "Passed", tone: "success" }] }] },
    ],
  },
};

/** The pieces of the page, in the order they build in. */
export const demoPieces = ["chart", "timeline", "board"] as const;
export type DemoPiece = (typeof demoPieces)[number];

function pieceElement(piece: DemoPiece, version: PlanVersion): Element {
  if (piece === "chart") return chart(version);
  if (piece === "timeline") return timeline(version);
  return board;
}

/** One piece as a spec of its own, for the renderer. */
export function demoPieceContent(piece: DemoPiece, version: PlanVersion): string {
  return JSON.stringify({ version: UI_SPEC_VERSION, root: piece, elements: { [piece]: pieceElement(piece, version) } });
}

/** The whole page: the `content` string the agent sends to artifacts_create and artifacts_update. */
export function demoArtifactContent(version: PlanVersion): string {
  return JSON.stringify({
    version: UI_SPEC_VERSION,
    root: "page",
    elements: {
      page: { type: "Stack", props: { gap: "lg" }, children: ["top", "board"] },
      top: { type: "Grid", props: { columns: 2 }, children: ["chart", "timeline"] },
      chart: chart(version),
      timeline: timeline(version),
      board,
    },
  });
}
