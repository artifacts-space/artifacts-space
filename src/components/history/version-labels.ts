import { formatInfo } from "@/lib/artifact-formats";
import type { VersionSaveKind, VersionSummaryDto } from "@/lib/artifact-types";
import { formatSize } from "@/lib/relative-time";

const saveKindLabels: Record<VersionSaveKind, string> = {
  create: "Created",
  edit: "Edited",
  files: "Changed files",
  replace: "Replaced a file",
  restore: "Restored an older version",
  snapshot: "Saved copy",
};

/** What a history entry says the save was. */
export function saveKindLabel(kind: VersionSaveKind): string {
  return saveKindLabels[kind];
}

/** What a history entry says it was, naming the file a replace replaced: "Replaced sow.pdf". */
export function versionLabel(version: Pick<VersionSummaryDto, "saveKind" | "replacedFile">): string {
  if (version.saveKind === "replace" && version.replacedFile) return `Replaced ${version.replacedFile}`;
  return saveKindLabel(version.saveKind);
}

/** The short size and format note under a history entry: "Markdown · 2.4 KB". */
export function versionNote(version: Pick<VersionSummaryDto, "kind" | "bytes">): string {
  return `${formatInfo[version.kind].label} · ${formatSize(version.bytes)}`;
}

/** Badges for an entry: what the artifact shows now, what readers outside the team see, and what waits. */
export function versionBadges(version: Pick<VersionSummaryDto, "latest" | "approved" | "pending">): string[] {
  const badges: string[] = [];
  if (version.latest) badges.push("Current");
  if (version.approved) badges.push("Live for readers");
  if (version.pending) badges.push("Waiting for approval");
  return badges;
}

/**
 * What the person reads after Restore: that it is restored, whether it waits
 * for approval, and when an agent saved since they opened History, that the
 * restore still went through and the agent's version is in History.
 */
export function restoredMessage(result: { artifact: { pendingEdit: unknown }; savedOverAgents: boolean }): string {
  const restored = result.artifact.pendingEdit ? "Restored. Waiting for approval." : "Restored.";
  return result.savedOverAgents ? `${restored} An agent saved changes since you opened History; theirs is in History.` : restored;
}
