import { UI_SPEC_VERSION } from "@/lib/ui/version";

/**
 * The example Claude Code session on the landing page. The terminal mockup and
 * the rendered artifact both read from here, so what the agent "sends" and
 * what the page shows cannot drift apart. `rollout-session.test.ts` checks
 * that the spec is a valid ui artifact and that the id is a real public id.
 */
export const rolloutSession = {
  artifactId: "q7Rk2VwX9mTn4LpB8sYc3A",
  title: "Checkout v2 rollout",
  summary: "Move checkout v2 from 5% to 100% of traffic in one week, with a hold over the weekend.",
  project: "checkout",
  team: "acme",
  agentHandle: "claude-code",
  ownerName: "Sam",
  reviewerHandle: "dana",
  firstPrompt: "Save the checkout v2 rollout plan as an artifact. Share it with the acme team and ask @dana to review the risks.",
  askForReview: "@dana The rollout plan is ready. Can you check the risks before we go past 5%?",
  secondPrompt: "Dana replied. Read her comment and update the plan.",
  reviewComment: "@claude-code Hold at 5% over the weekend. Payments on-call is thin until Monday.",
  reviewCommentId: "9b2e4c71-5d0a-4f3e-8a61-2c7d9e0f4b18",
  agentReply: "Done. The plan now holds at 5% until Monday, then moves to 25%.",
  agentSummary: "Dana asked for a weekend hold. I added it to the plan as version 2 and replied in the thread.",
} as const;

/** The plan as the agent saves it after the review: a json-render ui spec. */
export const rolloutSpec = {
  version: UI_SPEC_VERSION,
  root: "page",
  elements: {
    page: { type: "Stack", props: { gap: "lg" }, children: ["kpis", "plan", "risks"] },
    kpis: { type: "Grid", props: { columns: 3 }, children: ["traffic", "errors", "latency"] },
    traffic: { type: "Metric", props: { label: "Traffic on v2", value: 5, format: "percent" } },
    errors: { type: "Metric", props: { label: "Payment errors", value: 0.21, format: "percent", change: -0.04, goodDirection: "down" } },
    latency: { type: "Metric", props: { label: "p95 latency", value: 412, unit: "ms", change: -38, goodDirection: "down" } },
    plan: {
      type: "Timeline",
      props: {
        items: [
          { title: "5% of traffic", time: "Thu", status: "done", description: "Errors and latency stay inside the budget." },
          { title: "Hold at 5% over the weekend", time: "Fri to Sun", status: "current", description: "Added after Dana's review. Payments on-call is thin until Monday." },
          { title: "25% of traffic", time: "Mon", status: "upcoming" },
          { title: "100% of traffic", time: "Thu", status: "upcoming", description: "Remove the v1 flag one week later." },
        ],
      },
    },
    risks: {
      type: "Table",
      props: {
        caption: "Risks",
        columns: [
          { key: "risk", label: "Risk" },
          { key: "fallback", label: "Fallback" },
        ],
        rows: [
          { risk: "Card declines go up", fallback: "Turn the flag off. Traffic goes back to v1." },
          { risk: "Tax totals round differently", fallback: "Compare 200 orders against v1 before 25%." },
        ],
      },
    },
  },
};

/** The spec as the `content` string an agent sends to artifacts_create and artifacts_update. */
export const rolloutContent = JSON.stringify(rolloutSpec);
