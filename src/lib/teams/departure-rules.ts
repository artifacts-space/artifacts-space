/**
 * What a person sees before they leave a team, or before an owner or admin
 * removes them: which of their artifacts have the team as their home, that
 * those stay with the team, and who becomes their owner (heirAfterLeaving in
 * src/lib/sharing/transfer-rules.ts, the rule reconcileTeamArtifacts uses).
 * Pure: the server and the dialog read the same words and limits.
 */

/** An artifact of the departing person whose home is the team. */
export interface DepartingArtifact {
  id: string;
  publicId: string;
  title: string;
}

/** The person who takes the artifacts over, by name and handle. */
export interface Heir {
  name: string;
  username: string | null;
}

/** What leaving would hand over: every such artifact counted, the newest `departureLimits.listed` named. */
export interface LeavePreview {
  total: number;
  artifacts: DepartingArtifact[];
  heir: Heir | null;
}

/** For the remove confirm: how many of a member's artifacts have the team as their home, and who would take them. */
export interface RemovalFacts {
  artifacts: number;
  heir: Heir | null;
}

/** What one "Move to Personal" press did, artifact by artifact. */
export interface MoveOutcome {
  moved: DepartingArtifact[];
  /** Asked for, and waiting for an owner's or admin's approval: still in the team. */
  waiting: DepartingArtifact[];
  refused: { artifact: DepartingArtifact; reason: string }[];
}

/** A move's outcome and the preview read again afterwards, so the dialog shows what is true now. */
export interface MoveResult {
  outcome: MoveOutcome;
  preview: LeavePreview;
}

export const departureLimits = {
  /** Titles the leave preview loads; the count covers the rest. */
  listed: 100,
  /** Artifacts one move request takes. Each goes through the sharing service on its own. */
  movePerRequest: 100,
  /** Titles shown before "and N more". */
  shownBeforeMore: 5,
} as const;

/** "Ada Lovelace (@ada)", or the one of the two that exists. */
export function heirLabel(heir: Heir | null): string {
  if (!heir) return "the team's longest-standing owner";
  const name = heir.name.trim();
  const handle = heir.username ? `@${heir.username}` : "";
  if (name && handle) return `${name} (${handle})`;
  return name || handle || "the team's longest-standing owner";
}

function artifactCount(count: number, owner: "your" | "their"): string {
  return count === 1 ? `One of ${owner} artifacts lives` : `${String(count)} of ${owner} artifacts live`;
}

/**
 * The leave dialog's first sentence: how many stay behind and who gets them.
 * Null when nothing stays, which keeps the plain confirm.
 */
export function leaveSummary(preview: LeavePreview): string | null {
  if (preview.total === 0) return null;
  const they = preview.total === 1 ? "It stays" : "They stay";
  const their = preview.total === 1 ? "its" : "their";
  return `${artifactCount(preview.total, "your")} in this team. ${they} with the team when you leave, and ${heirLabel(preview.heir)}, its longest-standing owner, becomes ${their} owner.`;
}

/**
 * The remove confirm's text, for the owner or admin who removes a member.
 * The removed person is not asked anything, so it only says what happens.
 * Null facts (not loaded) keep the general sentence.
 */
export function removalDescription(input: RemovalFacts | null): string {
  const lead = "They lose access to this team at once.";
  const agents = "Agents they added go to the team's owner, and their tokens stop working at once.";
  if (!input) return `${lead} Artifacts they shared with the team stay with the team, and its owners take them over. ${agents}`;
  if (input.artifacts === 0) return `${lead} None of their artifacts live in this team. ${agents}`;
  const they = input.artifacts === 1 ? "It stays" : "They stay";
  const their = input.artifacts === 1 ? "its" : "their";
  return `${lead} ${artifactCount(input.artifacts, "their")} in this team. ${they} with the team, and ${heirLabel(input.heir)}, its longest-standing owner, becomes ${their} owner. ${agents}`;
}

/**
 * Which confirm leaving gets. With artifacts in the team the dialog carries a
 * choice (move them to Personal first), so it has no "Don't ask again" and
 * shows even when the plain confirm was turned off. Without, the plain
 * confirm, which a person may turn off.
 */
export function leaveConfirmKind(total: number): "choice" | "leaveTeam" {
  return total > 0 ? "choice" : "leaveTeam";
}

/**
 * Which confirm removing a member gets. Removing someone whose artifacts stay
 * asks under its own kind, so "Don't ask again" for plain removals never
 * skips the sentence about their artifacts (as removeAgentWithArtifacts does).
 */
export function removalConfirmKind(facts: RemovalFacts | null): "removeMemberWithArtifacts" | "removeMember" {
  return facts && facts.artifacts > 0 ? "removeMemberWithArtifacts" : "removeMember";
}

/** The titles to show, and how many more there are (loaded or not). */
export function shownArtifacts(preview: LeavePreview, showAll: boolean): { shown: DepartingArtifact[]; more: number } {
  const shown = showAll ? preview.artifacts : preview.artifacts.slice(0, departureLimits.shownBeforeMore);
  return { shown, more: Math.max(0, preview.total - shown.length) };
}

/**
 * The ids a move may take: only the person's own artifacts whose home is
 * this team, read on the server. Anything else the browser sent is left out
 * and counted, never moved.
 */
export function movableIds(requested: readonly string[], own: readonly DepartingArtifact[]): { allowed: DepartingArtifact[]; unknown: number } {
  const byId = new Map(own.map((item) => [item.id, item]));
  const allowed: DepartingArtifact[] = [];
  let unknown = 0;
  for (const id of new Set(requested)) {
    const item = byId.get(id);
    if (item) allowed.push(item);
    else unknown += 1;
  }
  return { allowed, unknown };
}

/** The toast after a move, or null when nothing moved. */
export function movedMessage(outcome: MoveOutcome): string | null {
  const count = outcome.moved.length;
  if (count === 0) return null;
  const [only] = outcome.moved;
  return count === 1 && only ? `Moved “${only.title}” to Personal.` : `Moved ${String(count)} artifacts to Personal.`;
}

/** A line the dialog keeps on screen about a move that did not happen, keyed by what it is about. */
export interface MoveNote {
  key: string;
  text: string;
}

/**
 * What did not move, in plain words, for the dialog to keep on screen. A
 * waiting move is not a move: the artifact stays with the team until an
 * owner or admin approves it, and leaving before then hands it over. Each
 * refusal is keyed by its artifact, since titles and reasons repeat.
 */
export function moveProblems(outcome: MoveOutcome): MoveNote[] {
  const notes: MoveNote[] = [];
  const waiting = outcome.waiting.length;
  if (waiting > 0) {
    const names = outcome.waiting.map((item) => `“${item.title}”`).join(", ");
    const text = waiting === 1
      ? `${names} waits for an owner's or admin's approval, so it is still in this team. If you leave now, it goes to the new owner.`
      : `${names} wait for an owner's or admin's approval, so they are still in this team. If you leave now, they go to the new owner.`;
    notes.push({ key: "waiting", text });
  }
  for (const { artifact, reason } of outcome.refused) notes.push({ key: artifact.id, text: `“${artifact.title}” did not move: ${reason}` });
  return notes;
}

/** The button that moves every listed artifact: "all" only when every one is listed. */
export function moveAllLabel(preview: LeavePreview): string {
  return preview.total > preview.artifacts.length ? `Move the newest ${String(preview.artifacts.length)} to Personal` : "Move all to Personal";
}
