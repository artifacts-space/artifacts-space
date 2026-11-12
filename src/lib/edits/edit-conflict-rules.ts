import type { HarnessId } from "@/lib/harness/harnesses";

/**
 * When a person and an agent change the same artifact at once, the person's
 * work wins. Pure rules, no database (the SQL in agent-write-guard.ts and
 * artifact-save.ts applies the same decisions in the write itself):
 *
 * - An agent names the version it read (`baseVersion`, from artifacts_get).
 *   When the artifact changed since, its save is refused and nothing is saved.
 * - An agent that names no version is refused while a person is typing in
 *   the artifact (a live edit lease), and whenever a person's save is the
 *   artifact's newest, for any field: it cannot know what that person wrote.
 *   It must read the artifact and send that baseVersion. Artifacts only
 *   agents saved last keep taking saves without one.
 * - A person's web save goes through when only agents saved since the
 *   person's editor loaded; the agents' versions stay in History.
 */

/** How long an edit lease lasts after the editor's last "I'm editing" signal. */
export const EDIT_LEASE_MS = 60_000;

/** The editor sends at most one "I'm editing" signal this often while typing goes on. */
export const EDIT_SIGNAL_INTERVAL_MS = 20_000;

/** Typing this recent counts as editing, even with nothing left to save. */
export const RECENT_TYPING_MS = 5_000;

/** A base version as agents send it back: the version they read, and the artifact's save time when they read it. */
export interface BaseVersion {
  versionId: string;
  updatedAt: Date;
}

/** Placeholder version id for an artifact saved before history began (it has no version yet). */
export const NO_VERSION_YET = "start";

const versionIdPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|start)$/;
const tokenPattern = /^([0-9a-z-]{5,36})\.(\d{1,15})$/;

/**
 * The `baseVersion` token an agent gets with the content it read and sends
 * back with its update: the id of the version it read and that save's time
 * in milliseconds. The time is what the write checks: a quick follow-up save
 * can fold into the same version id (history-rules.ts), but it always moves
 * the artifact's save time on.
 */
export function encodeBaseVersion(base: { versionId: string | null; updatedAt: Date | string }): string {
  const at = typeof base.updatedAt === "string" ? Date.parse(base.updatedAt) : base.updatedAt.getTime();
  return `${base.versionId ?? NO_VERSION_YET}.${String(at)}`;
}

/** Reads a `baseVersion` token, or null when it is not one this server handed out. */
export function parseBaseVersion(token: string): BaseVersion | null {
  const match = tokenPattern.exec(token.trim());
  if (!match) return null;
  const [, versionId = "", ms = ""] = match;
  if (!versionIdPattern.test(versionId)) return null;
  const updatedAt = new Date(Number(ms));
  return Number.isNaN(updatedAt.getTime()) ? null : { versionId, updatedAt };
}

/** Fields whose change by an agent is refused while a person is typing, unless the agent names its base version. */
export const leaseGuardedFields = ["title", "content", "kind"] as const;

/** True when an update changes the title, content, or format. */
export function touchesGuardedFields(changes: Partial<Record<(typeof leaseGuardedFields)[number], unknown>>): boolean {
  return leaseGuardedFields.some((field) => changes[field] !== undefined);
}

/**
 * Why an agent's save is refused: the artifact changed since the agent read
 * it, a person is typing in it, or a person saved it last and the agent
 * named no base version.
 */
export type AgentWriteRefusal = "changed" | "editing" | "base_needed";

/** What the agent-write rule looks at. */
export interface AgentWriteCheck {
  /** The agent's base version, parsed; undefined when it sent none. */
  base: BaseVersion | undefined;
  /** The artifact's save time now. */
  updatedAt: Date;
  /** Whether the save changes the title, content, or format (or brings back a version, which can change all three). */
  guarded: boolean;
  /** Whether a person's edit lease on the artifact is live. */
  leaseLive: boolean;
  /** Whether the artifact's newest save is a person's. */
  personSavedLast: boolean;
}

/** Postgres keeps microseconds; tokens and the browser carry milliseconds. */
function sameMillisecond(a: Date, b: Date): boolean {
  return Math.floor(a.getTime()) === Math.floor(b.getTime());
}

/**
 * Whether an agent's save is refused, and why; null when it may save. A base
 * version always decides: the save goes through only while the artifact is
 * still at it, live lease or not, so a careful agent is never locked out.
 * Without one, a change to the title, content, or format waits while a
 * person is typing, and any change is refused while a person's save is the
 * newest: the agent never saw it, so it could only overwrite it.
 */
export function agentWriteRefusal(check: AgentWriteCheck): AgentWriteRefusal | null {
  if (check.base) return sameMillisecond(check.base.updatedAt, check.updatedAt) ? null : "changed";
  if (check.guarded && check.leaseLive) return "editing";
  return check.personSavedLast ? "base_needed" : null;
}

/** A lease is live until its expiry. */
export function leaseIsLive(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() > now.getTime();
}

/** What the editor knows when the person changes something. Times are ms since the epoch. */
export interface EditSignalCheck {
  now: number;
  /** When the editor last sent the signal; null before the first. */
  lastSignalAt: number | null;
  /** The editor has changes it has not saved yet. */
  unsaved: boolean;
  /** When the person last typed; null before they did. */
  lastInputAt: number | null;
}

/**
 * Whether the editor sends "I'm editing" now. It runs on input only, never
 * on a timer: at most once every EDIT_SIGNAL_INTERVAL_MS, and only while the
 * person has unsaved changes or typed in the last few seconds.
 */
export function shouldSignalEditing(check: EditSignalCheck): boolean {
  const typing = check.lastInputAt !== null && check.now - check.lastInputAt <= RECENT_TYPING_MS;
  if (!check.unsaved && !typing) return false;
  return check.lastSignalAt === null || check.now - check.lastSignalAt >= EDIT_SIGNAL_INTERVAL_MS;
}

/** Who saved since the agent read the artifact: their handle, and the agent harness, or null for the web app. */
export interface ChangedBy {
  handle: string | null;
  harness: { id: HarnessId; name: string } | null;
}

function changedByPhrase(changedBy: ChangedBy | null): string {
  if (!changedBy) return "";
  const who = changedBy.handle ? `@${changedBy.handle}` : "someone";
  return ` (by ${who} ${changedBy.harness ? `via ${changedBy.harness.name}` : "via the web"})`;
}

/** The refusal message an agent gets. It says what happened and the one way forward: read, merge, save with the new base. */
export function agentRefusalMessage(refusal: AgentWriteRefusal, changedBy: ChangedBy | null): string {
  if (refusal === "base_needed") {
    const who = changedBy?.handle ? `@${changedBy.handle}` : "A person";
    return `${who} saved this artifact last, and your update sent no baseVersion. Nothing was saved. Read the artifact with artifacts_get and pass its baseVersion: merge your changes into the content you get, and send that baseVersion with your update.`;
  }
  if (refusal === "changed") {
    return `This artifact changed since you read it${changedByPhrase(changedBy)}. Nothing was saved. Read it again with artifacts_get, merge your changes into the new content, and save with the new baseVersion.`;
  }
  const who = changedBy?.handle ? `@${changedBy.handle}` : "Someone";
  return `${who} is editing this artifact in the web app right now. Nothing was saved. Read it with artifacts_get, merge your changes into the content you get, and save with its baseVersion; or try again in a minute.`;
}

/** The stable codes of the refusals, for clients that branch on them. */
export const agentRefusalCodes: Record<AgentWriteRefusal, string> = {
  changed: "artifact_changed",
  editing: "artifact_being_edited",
  base_needed: "base_version_required",
};
