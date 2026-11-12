/**
 * The decisions behind scripts/create-reviewer-account.mts, kept pure so they
 * are tested without a database: which arguments it takes, which emails and
 * databases it accepts, how long the password is, and what it seeds.
 */
import { parseArgs } from "node:util";

import { z } from "zod";

import { isLocalDatabaseUrl } from "../src/lib/db/database-url-rules.ts";
import { validateHandle } from "../src/lib/handles.ts";

type Env = Readonly<Record<string, string | undefined>>;

/** The variable that lets one run reach a database that is not on this machine. */
export const ALLOW_SHARED_REVIEWER_ACCOUNT = "ALLOW_SHARED_REVIEWER_ACCOUNT";

/** The only domains a reviewer account may use: the site's own, and the reserved test domain for local runs. */
export const reviewerEmailDomains = ["artifacts.space", "example.com"] as const;

/** Random bytes in a password: 24 bytes are 32 base64url characters, about 192 bits. */
export const PASSWORD_BYTES = 24;

/** The shortest password the script prints. Better Auth's `minPasswordLength` for this app matches it. */
export const MIN_PASSWORD_LENGTH = 24;

export const usage = [
  "Usage: node scripts/create-reviewer-account.mts --email <address> --name <display name> --username <username> [--reset-password]",
  "",
  "Creates one reviewer account with a password and a few private sample artifacts, and prints the password once.",
  "With --reset-password it gives an existing reviewer account a new password instead and signs it out everywhere.",
  `The email must be under @${reviewerEmailDomains.join(" or @")}.`,
  "The database comes from DATABASE_URL_UNPOOLED or DATABASE_URL set for this run; .env.local is never read.",
  `A database that is not on this machine needs ${ALLOW_SHARED_REVIEWER_ACCOUNT}=1 for that one run.`,
].join("\n");

/** What the person asked for. */
export interface ReviewerRequest {
  email: string;
  name: string;
  username: string;
  resetPassword: boolean;
}

/** True when `email` is under one of the reviewer domains, and nothing else. */
export function isReviewerEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const domain = email.slice(at + 1);
  return (reviewerEmailDomains as readonly string[]).includes(domain);
}

const requestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .refine(isReviewerEmail, `The email must be under @${reviewerEmailDomains.join(" or @")}.`),
  name: z.string().trim().min(1, "Give a display name with --name.").max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((value, ctx) => {
      const problem = validateHandle(value);
      if (problem) ctx.addIssue({ code: "custom", message: `Username: ${problem}` });
    }),
  resetPassword: z.boolean(),
});

/** Reads the arguments. Returns the request, or the problems to print with the usage. */
export function parseReviewerArgs(argv: readonly string[]): { ok: true; request: ReviewerRequest } | { ok: false; error: string } {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: { email: { type: "string" }, name: { type: "string" }, username: { type: "string" }, "reset-password": { type: "boolean" } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The arguments could not be read." };
  }
  const parsed = requestSchema.safeParse({ email: values.email ?? "", name: values.name ?? "", username: values.username ?? "", resetPassword: values["reset-password"] === true });
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("\n") };
  return { ok: true, request: parsed.data };
}

/**
 * The database this run writes to, or why it must stop before it connects.
 * Only what is set for this run counts, never `.env.local`. A database that
 * is not on this machine needs ALLOW_SHARED_REVIEWER_ACCOUNT=1. The message
 * never shows the URL, which holds a password.
 */
export function reviewerDatabase(env: Env): { ok: true; url: string } | { ok: false; error: string } {
  const url = env.DATABASE_URL_UNPOOLED?.trim() || env.DATABASE_URL?.trim() || "";
  if (!url) return { ok: false, error: "No database: set DATABASE_URL (or DATABASE_URL_UNPOOLED) for this run." };
  if (isLocalDatabaseUrl(url) || env[ALLOW_SHARED_REVIEWER_ACCOUNT] === "1") return { ok: true, url };
  return {
    ok: false,
    error: `Stopped: the database is not on this machine. To write a reviewer account to a shared database on purpose, set ${ALLOW_SHARED_REVIEWER_ACCOUNT}=1 for this one run.`,
  };
}

/** True when a generated password is long enough to print. */
export function isStrongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && /^[A-Za-z0-9_-]+$/.test(password);
}

/** One private sample artifact for a new reviewer account. */
export interface SampleArtifact {
  title: string;
  summary: string;
  kind: "markdown" | "csv";
  content: string;
}

/** Neutral sample content, so a reviewer's workspace is not empty. */
export const sampleArtifacts: readonly SampleArtifact[] = [
  {
    title: "Launch plan: shared reading list",
    summary: "A three-week plan to launch a reading list the whole team can add to.",
    kind: "markdown",
    content: [
      "# Launch plan: shared reading list",
      "",
      "## Goal",
      "",
      "Give the team one place to keep the articles and papers worth reading, with a short note on each.",
      "",
      "## Steps",
      "",
      "1. Week 1: collect the links people already keep in chat and in their bookmarks.",
      "2. Week 2: sort them by topic and add a two-line note to each.",
      "3. Week 3: share the list with the team and ask for one addition from each person.",
      "",
      "## Open questions",
      "",
      "- [ ] Who checks new additions each week?",
      "- [ ] Do we keep links that are behind a paywall?",
      "",
    ].join("\n"),
  },
  {
    title: "How we write meeting notes",
    summary: "A short guide to notes that people who missed the meeting can use.",
    kind: "markdown",
    content: [
      "# How we write meeting notes",
      "",
      "Write notes for the people who were not there. Keep them short.",
      "",
      "- Start with the decisions, then the open questions.",
      "- Give every action an owner and a date.",
      "- Link to the documents you talked about instead of copying them.",
      "",
      "Post the notes on the same day.",
      "",
    ].join("\n"),
  },
  {
    title: "Office supplies budget",
    summary: "This quarter's supplies budget by category.",
    kind: "csv",
    content: ["Category,Budget,Spent,Left", "Paper and printing,300,120,180", "Desk supplies,200,85,115", "Kitchen,250,190,60", "Shipping,150,40,110", ""].join("\n"),
  },
];

/** Bytes a version takes for the storage quota, as src/lib/versions/history-rules.ts counts them (no metadata). */
export function sampleVersionBytes(sample: SampleArtifact): number {
  return new TextEncoder().encode(sample.content).length + new TextEncoder().encode("{}").length;
}
