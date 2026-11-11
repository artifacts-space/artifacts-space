import { formatInfo } from "@/lib/artifact-formats";
import { updateCheckOptions, validateArtifactContent } from "@/lib/artifact-content";
import type { ArtifactKind } from "@/lib/artifact-types";

/**
 * Why the artifact's content cannot switch to `kind`, or null when it can.
 * The same check every save runs (validateArtifactContent), so a switch the
 * server would refuse is refused here first, with its reason.
 * `storedContent` is the body as stored: when it is empty (a page not stored
 * yet, or one stored with only a title), the page may go back to an empty
 * Markdown body (updateCheckOptions). On a `blank` page, not stored yet,
 * Text and Code may start empty too: nothing is stored until something is
 * written in them.
 */
export function formatSwitchProblem(kind: ArtifactKind, content: string, page: { storedContent?: string; blank?: boolean } = {}): string | null {
  if (page.blank === true && content === "" && startsEmptyOnBlank.has(kind)) return null;
  const check = validateArtifactContent(kind, content, page.storedContent === undefined ? {} : updateCheckOptions(page.storedContent));
  const firstError = check.issues.find((issue) => issue.severity === "error");
  if (!firstError) return null;
  return `This content can’t be ${formatInfo[kind].label} yet. ${firstError.message}`;
}

/** Formats a blank page may switch to with nothing in it: they take any text, so the first words typed make them valid. */
const startsEmptyOnBlank: ReadonlySet<ArtifactKind> = new Set(["text", "code"]);

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
