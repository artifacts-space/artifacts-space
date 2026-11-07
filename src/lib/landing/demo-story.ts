/**
 * The script of the landing-page demo: one Claude Code session beside the
 * artifacts.space app. Each tool call lands in the terminal, then changes the
 * app. The page renders the finished session; demo.css replays it on
 * scroll-in, with each element waiting its own beat (`--d-in`, in seconds),
 * and DemoReplay restarts it on a loop while it is on screen.
 *
 * Tool names and argument keys are the ones the MCP server registers;
 * `demo-story.test.ts` holds them together. Values are short on purpose:
 * Claude Code shows compact arguments, and so does the demo.
 */

/** When each beat lands, in seconds after the replay starts. */
export const T = {
  type: 0.3,
  send: 2.5,
  create: 3.0,
  created: 3.6,
  open: 4.2,
  chart: 4.5,
  timeline: 4.9,
  board: 5.3,
  share: 6.0,
  sharePick: 6.5,
  shared: 7.1,
  mention: 7.7,
  notified: 8.2,
  typing: 8.8,
  reply: 9.7,
  inbox: 10.2,
  read: 10.7,
  update: 11.3,
  updated: 11.8,
  wrap: 12.5,
} as const;

/** Seconds between typed characters in the prompt. */
export const TYPE_STEP = 0.02;

/** How long the finished session holds before the loop replays it, in seconds. */
export const HOLD = 4;

export const demoPeople = {
  owner: { name: "Sam", seed: "sam" },
  reviewer: { name: "Dana", handle: "dana", seed: "dana" },
  agent: { handle: "claude-code", seed: "claude-code" },
  team: { name: "Acme", slug: "acme" },
  project: "checkout",
} as const;

export const demoTitle = "Checkout v2 rollout";
export const demoSummary = "Move checkout v2 to all traffic in one week.";
const shortId = "q7Rk2V…";

export const demoPrompt = "Save the checkout v2 rollout plan as an artifact and ask @dana to check the risks.";
export const agentAsk = "Can you check the risks before we pass 5%?";
export const reviewerReply = "Hold at 5% over the weekend. Payments on-call is thin until Monday.";
export const agentWrap = "Dana asked for a weekend hold. The plan now holds at 5% until Monday, saved as version 2.";

/** One argument as Claude Code prints it: the key, then a short value. */
export type CallArg = readonly [key: string, value: string];

export interface DemoCall {
  tool: string;
  args: readonly CallArg[];
  result: string;
  at: number;
  resultAt: number;
}

const pageContent = "{ Chart, Timeline, Board }";

export const demoCalls: readonly DemoCall[] = [
  {
    tool: "artifacts_create",
    args: [["title", demoTitle], ["kind", "ui"], ["project", demoPeople.project], ["content", pageContent]],
    result: "Saved. Only you can see it.",
    at: T.create,
    resultAt: T.created,
  },
  {
    tool: "artifacts_update",
    args: [["id", shortId], ["visibility", "team"], ["team", demoPeople.team.slug]],
    result: `Shared with ${demoPeople.team.name}.`,
    at: T.share,
    resultAt: T.shared,
  },
  {
    tool: "comment_create",
    args: [["artifact", shortId], ["body", `@${demoPeople.reviewer.handle} ${agentAsk}`]],
    result: `Notified @${demoPeople.reviewer.handle}.`,
    at: T.mention,
    resultAt: T.notified,
  },
  {
    tool: "inbox_list",
    args: [],
    result: `@${demoPeople.reviewer.handle}: "${reviewerReply}"`,
    at: T.inbox,
    resultAt: T.read,
  },
  {
    tool: "artifacts_update",
    args: [["id", shortId], ["content", pageContent]],
    result: "Saved version 2.",
    at: T.update,
    resultAt: T.updated,
  },
];

/** The other artifacts already in the list when the new one lands. */
export const demoListRows = [
  { title: "Payments on-call runbook", kind: "markdown", meta: "payments · 2 h ago", visibility: "Team" },
  { title: "Tax rounding notes", kind: "code", meta: "checkout · Yesterday", visibility: "Team" },
  { title: "Q3 conversion review", kind: "ui", meta: "growth · Mon", visibility: "Link" },
  { title: "Retry queue design", kind: "mermaid", meta: "payments · Oct 28", visibility: "Team" },
  { title: "Refund API types", kind: "code", meta: "billing · Oct 24", visibility: "Private" },
] as const;

/** The beat the prompt's character at `index` appears. */
export function typedAt(index: number): number {
  return Math.round((T.type + index * TYPE_STEP) * 1000) / 1000;
}

/** One full loop in milliseconds: the last beat, its landing, then the hold. */
export function replayCycleMs(): number {
  const lastBeat = Math.max(...Object.values(T));
  return Math.round((lastBeat + 1 + HOLD) * 1000);
}
