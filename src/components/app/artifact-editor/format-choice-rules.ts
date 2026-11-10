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

/** A small valid start for formats that cannot begin empty, so an empty page can become a table, an interface, or a diagram. */
const starters: Partial<Record<ArtifactKind, string>> = {
  csv: "Name,Value\n,",
  json: "{}",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
  mermaid: "flowchart TD\n  A --> B",
  ui: JSON.stringify({ version: 1, root: "page", elements: { page: { type: "Stack", props: {}, children: ["title"] }, title: { type: "Heading", props: { text: "Untitled", level: 1 } } } }, null, 2),
};

/** The content after a switch to `kind`: an empty page gets that format's starter; anything written stays as it is. */
export function contentForSwitch(kind: ArtifactKind, content: string): string {
  if (content.trim() !== "") return content;
  return starters[kind] ?? content;
}
