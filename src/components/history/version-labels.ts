import { formatInfo } from "@/lib/artifact-formats";
import type { VersionSaveKind, VersionSummaryDto } from "@/lib/artifact-types";
import { formatSize } from "@/lib/relative-time";

const saveKindLabels: Record<VersionSaveKind, string> = {
  create: "Created",
  edit: "Edited",
  files: "Changed files",
  restore: "Restored an older version",
  snapshot: "Saved copy",
};

/** What a history entry says the save was. */
export function saveKindLabel(kind: VersionSaveKind): string {
  return saveKindLabels[kind];
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
