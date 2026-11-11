import { z } from "zod";

/**
 * "Something's not working" reports, as pure rules: what a person may send,
 * what reaches Slack, and which webhook URLs count as configured. A report
 * carries the note, who sent it, and where they were. It never carries
 * artifact content, titles, file names, or anything typed into the editor,
 * and the page is a pathname only: query strings and hashes are dropped.
 */

export const FEEDBACK_NOTE_MAX_LENGTH = 2000;

/** Caps on everything else in a report, so one field cannot flood a message. */
export const feedbackFieldCaps = {
  name: 100,
  email: 254,
  path: 300,
  teamSlug: 64,
  userAgent: 300,
  viewport: 100_000,
} as const;

export const SLACK_WEBHOOK_PREFIX = "https://hooks.slack.com/";

export const feedbackMessages = {
  empty: "Tell us what went wrong.",
  tooLong: `Keep it to ${FEEDBACK_NOTE_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`,
  signedOut: "Sign in to send a report.",
  unavailable: "Feedback isn't available right now.",
  retry: "Your report was not sent. Check your connection and try again.",
  sent: "Thanks — we got it",
} as const;

const teamSlugPattern = /^[a-z0-9][a-z0-9-]*$/i;

/** What the dialog sends. The server adds who sent it, the browser, the deploy, and the time. */
export const feedbackInputSchema = z.object({
  note: z.string().trim().min(1, feedbackMessages.empty).max(FEEDBACK_NOTE_MAX_LENGTH, feedbackMessages.tooLong),
  path: z.string().max(2048).catch("/"),
  teamSlug: z.string().max(feedbackFieldCaps.teamSlug).regex(teamSlugPattern).nullable().catch(null),
  viewport: z
    .object({ width: z.number().int().min(0).max(feedbackFieldCaps.viewport), height: z.number().int().min(0).max(feedbackFieldCaps.viewport) })
    .nullable()
    .catch(null),
});

export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

/** The message the dialog shows for a note, or "" when it can be sent. Same rules as the server's schema. */
export function feedbackNoteError(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length === 0) return feedbackMessages.empty;
  if (trimmed.length > FEEDBACK_NOTE_MAX_LENGTH) return feedbackMessages.tooLong;
  return "";
}

/**
 * The webhook URL when it is a Slack Incoming Webhook, or null. Anything
 * else (missing, blank, another host, http, credentials, a port) counts as
 * not configured, so reports are never posted anywhere but Slack.
 */
export function slackWebhookUrl(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed.startsWith(SLACK_WEBHOOK_PREFIX) || trimmed.length === SLACK_WEBHOOK_PREFIX.length) return null;
  return isExactSlackHost(trimmed) ? trimmed : null;
}

/** Whether a URL parses as https on hooks.slack.com itself, with no port or credentials. */
function isExactSlackHost(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "hooks.slack.com" && `${url.port}${url.username}${url.password}` === "";
  } catch {
    return false;
  }
}

// Control characters other than tab and newline would garble the message.
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Text cut to a cap, with control characters removed. */
export function capText(value: string, max: number): string {
  const clean = value.replace(controlCharacters, "");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Escapes the three characters Slack treats as markup, so text can never
 * become a mention (`<!channel>`, `<@U123>`) or a link (`<https://…|…>`).
 */
export function escapeSlackText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** The pathname of a page address: no origin, query string, or hash, and never empty. */
export function pagePath(value: string): string {
  const withoutHash = value.split("#", 1)[0] ?? "";
  const pathname = withoutHash.split("?", 1)[0]?.trim() ?? "";
  if (!pathname.startsWith("/")) return "/";
  return capText(pathname, feedbackFieldCaps.path);
}

/**
 * The shared team workspace a page shows, from its address: `/teams/<slug>`
 * or the `?team=<slug>` scope of the workspace. The server still checks the
 * person is a member before the slug reaches a report.
 */
export function teamSlugFromLocation(pathname: string, search: string): string | null {
  const [, section, slug] = pathname.split("/");
  if (section === "teams" && slug && slug !== "new") return teamSlugPattern.test(slug) ? slug : null;
  const scope = new URLSearchParams(search).get("team");
  return scope && teamSlugPattern.test(scope) ? scope : null;
}

/** The deploy a report came from: the short commit and the Vercel environment. */
export function deployLabel(commitSha: string | undefined, vercelEnv: string | undefined): string {
  const sha = commitSha?.trim().slice(0, 7) ?? "";
  const env = vercelEnv?.trim() ?? "";
  return `${sha || "unknown commit"} (${env || "local"})`;
}

/** Everything one report holds, after the server checked it. */
export interface FeedbackReport {
  note: string;
  name: string;
  email: string;
  path: string;
  /** A shared team the person is a member of, or null. */
  teamSlug: string | null;
  userAgent: string | null;
  viewport: { width: number; height: number } | null;
  deploy: string;
  sentAt: Date;
}

interface PlainText {
  type: "plain_text";
  text: string;
  emoji: false;
}

type SlackBlock =
  | { type: "header"; text: PlainText }
  | { type: "section"; text: PlainText }
  | { type: "section"; fields: PlainText[] }
  | { type: "context"; elements: PlainText[] };

/** The Incoming Webhook body for one report. */
export interface SlackFeedbackPayload {
  text: string;
  blocks: SlackBlock[];
  unfurl_links: false;
  unfurl_media: false;
}

/**
 * Escaped text that fits in `max` characters after escaping, cut on a whole
 * character so an entity such as `&lt;` is never split.
 */
export function escapeWithin(value: string, max: number): string {
  const escaped = escapeSlackText(value);
  if (escaped.length <= max) return escaped;
  let kept = "";
  for (const character of value) {
    const next = escapeSlackText(character);
    if (kept.length + next.length > max - 1) break;
    kept += next;
  }
  return `${kept}…`;
}

/** Plain text for Slack: never parsed for mentions or links, escaped as well, and within Slack's limit for the block. */
function plain(value: string, max: number): PlainText {
  return { type: "plain_text", text: escapeWithin(capText(value, max), max), emoji: false };
}

/** Slack's limits: 150 characters for a header, 3,000 for section text, 2,000 for a field or context element. */
const slackMax = { header: 150, section: 3000, field: 2000 } as const;

/**
 * The Slack message for a report. Every value a person controls (the note,
 * their name, the page, the team, the browser) is plain text, escaped and
 * capped, so it cannot ping @channel or @here, mention anyone, or link
 * anywhere. The notification text names no one and quotes nothing.
 */
export function buildFeedbackPayload(report: FeedbackReport): SlackFeedbackPayload {
  const viewport = report.viewport ? `${String(report.viewport.width)} × ${String(report.viewport.height)}` : "unknown";
  const team = report.teamSlug ? capText(report.teamSlug, feedbackFieldCaps.teamSlug) : "Personal workspace";
  return {
    text: "Something's not working: a new report from the app",
    unfurl_links: false,
    unfurl_media: false,
    blocks: [
      { type: "header", text: plain("Something's not working", slackMax.header) },
      { type: "section", text: plain(capText(report.note, FEEDBACK_NOTE_MAX_LENGTH), slackMax.section) },
      {
        type: "section",
        fields: [
          plain(`From: ${capText(report.name, feedbackFieldCaps.name)}`, slackMax.field),
          plain(`Email: ${capText(report.email, feedbackFieldCaps.email)}`, slackMax.field),
          plain(`Page: ${pagePath(report.path)}`, slackMax.field),
          plain(`Team: ${team}`, slackMax.field),
          plain(`Viewport: ${viewport}`, slackMax.field),
          plain(`Deploy: ${report.deploy}`, slackMax.field),
        ],
      },
      {
        type: "context",
        elements: [
          plain(`Browser: ${report.userAgent ? capText(report.userAgent, feedbackFieldCaps.userAgent) : "unknown"}`, slackMax.field),
          plain(`Sent: ${report.sentAt.toISOString()}`, slackMax.field),
        ],
      },
    ],
  };
}
