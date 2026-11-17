import { iconFileId } from "@/lib/artifact-icons";
import { coverFileId } from "@/lib/covers/cover";

import { fileRefsInContent } from "./refs";

/**
 * Which files an artifact's page lists apart from its content. A document
 * shows its files in its text, where they were dropped, so the page has no
 * section for adding files. A file the page shows nowhere (attached by an
 * agent with files_attach, or from before files went into the text) must
 * still be reachable, so those, and only those, are listed, and the list
 * goes once nothing is left in it. Pure rules, tested without a browser.
 */

/** What the page shows under an artifact's content for its files. */
export type FilesPanel = "section" | "list";

/**
 * The formats whose page keeps the Files section, with its upload box: a
 * Files artifact, whose files are its content and have no other way in, and
 * an interface or a canvas, whose Image and File elements name a file by an
 * id copied from its row. Every other format gets the quiet list.
 */
export function filesPanel(kind: string): FilesPanel {
  return kind === "file" || kind === "ui" || kind === "canvas" ? "section" : "list";
}

/** A file as the list needs it. */
interface ListedFile {
  id: string;
  embedded?: boolean | undefined;
  pictured?: boolean | undefined;
}

/** The artifact as the page has it now, with what was typed and not saved yet. */
interface ShownArtifact {
  kind: string;
  content: string;
  icon: string | null;
  cover: string | null;
}

/**
 * The files the page shows nowhere else: not media the document embeds
 * (`embedded`), not linked or shown by the content as it is now, and not an
 * icon or cover image of the artifact or of a version (`pictured`), which
 * change through their pickers. In the order the artifact holds them.
 */
export function looseFiles<T extends ListedFile>(files: readonly T[], artifact: ShownArtifact): T[] {
  const inContent = new Set(fileRefsInContent(artifact.kind, artifact.content));
  const icon = iconFileId(artifact.icon);
  const cover = coverFileId(artifact.cover);
  return files.filter((file) => file.embedded !== true && file.pictured !== true && file.id !== icon && file.id !== cover && !inContent.has(file.id.toLowerCase()));
}

/** True when a file can be put into a document's text from the list: only a document has text for it. */
export function addsToDocument(kind: string): boolean {
  return kind === "markdown";
}
