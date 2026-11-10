import { formatInfo } from "@/lib/artifact-formats";
import { validateArtifactContent } from "@/lib/artifact-content";
import type { ArtifactKind } from "@/lib/artifact-types";

/**
 * Why the artifact's content cannot switch to `kind`, or null when it can.
 * The same check every save runs (validateArtifactContent), so a switch the
 * server would refuse is refused here first, with its reason.
 */
export function formatSwitchProblem(kind: ArtifactKind, content: string): string | null {
  const check = validateArtifactContent(kind, content);
  const firstError = check.issues.find((issue) => issue.severity === "error");
  if (!firstError) return null;
  return `This content can’t be ${formatInfo[kind].label} yet. ${firstError.message}`;
}
