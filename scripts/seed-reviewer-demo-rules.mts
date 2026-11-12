/**
 * The decisions behind scripts/seed-reviewer-demo.mts, kept pure so they are
 * tested without a database: which arguments it takes, the demo content a
 * connector directory's written test cases need, and the line it prints.
 */
import { parseArgs } from "node:util";

import { z } from "zod";

import { ALLOW_SHARED_REVIEWER_ACCOUNT } from "./create-reviewer-account-rules.mts";

export const seedUsage = [
  "Usage: node scripts/seed-reviewer-demo.mts --email <reviewer address> --commenter-email <other reviewer address> [--reset]",
  "",
  "Fills a reviewer account (made with reviewer:create) with the demo data the directory test cases need.",
  "The other reviewer account writes the one comment that waits in the first account's inbox.",
  "Without --reset an account that already holds the demo data is left as it is.",
  "With --reset the account's artifacts, projects, inbox, and notifications are removed first, so it is back at the starting state.",
  "The database comes from DATABASE_URL_UNPOOLED or DATABASE_URL set for this run; .env.local is never read.",
  `A database that is not on this machine needs ${ALLOW_SHARED_REVIEWER_ACCOUNT}=1 for that one run.`,
].join("\n");

/** What the owner asked for. */
export interface SeedRequest {
  email: string;
  commenterEmail: string;
  reset: boolean;
}

const emailField = (flag: string) => z.string().trim().toLowerCase().pipe(z.email(`Give a reviewer address with ${flag}.`));

const seedRequestSchema = z
  .object({ email: emailField("--email"), commenterEmail: emailField("--commenter-email"), reset: z.boolean() })
  .refine((request) => request.email !== request.commenterEmail, "The commenter must be another reviewer account, not the same one.");

/** Reads the arguments. Returns the request, or the problems to print with the usage. */
export function parseSeedArgs(argv: readonly string[]): { ok: true; request: SeedRequest } | { ok: false; error: string } {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: { email: { type: "string" }, "commenter-email": { type: "string" }, reset: { type: "boolean" } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The arguments could not be read." };
  }
  const parsed = seedRequestSchema.safeParse({ email: values.email ?? "", commenterEmail: values["commenter-email"] ?? "", reset: values.reset === true });
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("\n") };
  return { ok: true, request: parsed.data };
}

/** One demo artifact, as the account's owner would have written it in the web app. */
export interface DemoArtifact {
  title: string;
  summary: string;
  content: string;
}

const lines = (...text: string[]) => [...text, ""].join("\n");

/** The project test case 1 saves into, and the artifact that is in it from the start. */
export const launchProject = "Launch";
export const launchTimeline: DemoArtifact = {
  title: "Launch timeline",
  summary: "Three weeks from the beta build to the announcement.",
  content: lines("# Launch timeline", "", "- Week 1: finish the beta build and the release notes.", "- Week 2: invite the first beta users and collect feedback.", "- Week 3: fix the top issues and plan the announcement."),
};

/** Test case 2, oldest first: they are created in this order, so the guide is the newest. */
export const onboardingArtifacts: readonly DemoArtifact[] = [
  {
    title: "Onboarding notes",
    summary: "What we learned from the first two weeks with new teammates.",
    content: lines("# Onboarding notes", "", "- People asked where to find the team calendar.", "- Laptop setup took most of the first morning.", "- A buddy for the first week helped more than any document."),
  },
  {
    title: "Onboarding checklist",
    summary: "The steps to finish before and during a new teammate's first week.",
    content: lines("# Onboarding checklist", "", "- [ ] Send the welcome email before the first day", "- [ ] Set up the laptop and accounts", "- [ ] Pick a buddy for the first week", "- [ ] Book a check-in at the end of week two"),
  },
  {
    title: "Onboarding guide",
    summary: "How we welcome a new teammate, from the week before they start to the end of their first month.",
    content: lines(
      "# Onboarding guide",
      "",
      "## Before day one",
      "",
      "Send the welcome email, prepare the laptop, and choose a buddy.",
      "",
      "## First week",
      "",
      "Meet the team, set up accounts, and ship one small change with the buddy's help.",
      "",
      "## First month",
      "",
      "Take on a first project, with check-ins at the end of week two and week four.",
    ),
  },
];

/** The one unchecked line in the release checklist, and what test case 3 turns it into. */
export const databaseStep = "- [ ] Run the database migration";
export const databaseStepDone = "- [x] Run the database migration";

/** Test case 3: one unchecked step, plainly the database step. */
export const releaseChecklist: DemoArtifact = {
  title: "Release checklist",
  summary: "The steps for this week's release.",
  content: lines("# Release checklist", "", "- [x] Freeze the release branch", "- [x] Run the full test suite", databaseStep, "- [x] Update the release notes", "- [x] Tell support what changed"),
};

/** Test case 4: the artifact the other reviewer comments on. */
export const apiSpec: DemoArtifact = {
  title: "API spec",
  summary: "Version 1 of the orders API: endpoints, errors, and rate limits.",
  content: lines(
    "# API spec",
    "",
    "## Endpoints",
    "",
    "- `GET /orders` lists orders, newest first, 50 per page.",
    "- `GET /orders/{id}` returns one order.",
    "- `POST /orders` creates an order and returns its id.",
    "",
    "## Errors",
    "",
    "Every error returns a JSON body with `code` and `message`.",
    "",
    "## Rate limits",
    "",
    "100 requests per minute per key. Over the limit, the answer is 429 with `Retry-After`.",
  ),
};

/** The comment the other reviewer leaves on the API spec, mentioning the reviewer so it reaches their inbox. */
export function apiSpecComment(reviewerHandle: string): string {
  return `@${reviewerHandle} Could you check the rate limits section before we publish? I think 100 a minute is right.`;
}

/** Test case 5: the roadmap's saves, oldest first. Each is its own version with visibly different content. */
export const roadmapTitle = "Q4 roadmap";
export const roadmapSummary = "What we plan to ship this quarter, month by month.";
export const roadmapVersions: readonly string[] = [
  lines("# Q4 roadmap", "", "- October: finish the billing page", "- November: start the mobile app"),
  lines("# Q4 roadmap", "", "- October: finish the billing page", "- November: start the mobile app", "- December: plan next year"),
  lines("# Q4 roadmap", "", "- October: finish the billing page", "- November: ship the mobile app beta", "- December: plan next year with the team"),
];

/** Titles that only the demo data uses. An account holding any of them already has the demo data. */
export const demoTitles: readonly string[] = [launchTimeline.title, ...onboardingArtifacts.map((item) => item.title), releaseChecklist.title, apiSpec.title, roadmapTitle];

/** What a run removed and created, for its one-line report. */
export interface SeedCounts {
  removedArtifacts: number;
  removedProjects: number;
  removedInboxEntries: number;
  removedNotifications: number;
  createdArtifacts: number;
  createdVersions: number;
  createdComments: number;
}

function count(value: number, one: string, many: string): string {
  return `${String(value)} ${value === 1 ? one : many}`;
}

/** The one line a run prints on stderr: counts only, never content or addresses. */
export function seedReport(counts: SeedCounts, alreadySeeded: boolean): string {
  const removed = `Removed ${count(counts.removedArtifacts, "artifact", "artifacts")}, ${count(counts.removedProjects, "project", "projects")}, ${count(counts.removedInboxEntries, "inbox entry", "inbox entries")}, and ${count(counts.removedNotifications, "notification", "notifications")}.`;
  if (alreadySeeded) return `${removed} The account already holds the demo data, so nothing was created. Run with --reset to put it back to the starting state.`;
  return `${removed} Created ${count(counts.createdArtifacts, "artifact", "artifacts")}, ${count(counts.createdVersions, "later version", "later versions")}, and ${count(counts.createdComments, "comment", "comments")}.`;
}
