import { iconFileId } from "@/lib/artifact-icons";
import { coverFileId } from "@/lib/covers/cover";

import { fileRefsInContent } from "./refs";

/**
 * Which files an artifact's page lists apart from its content. A document
 * shows its files in its text, where they were dropped, so the page has no
 * section for adding files. A file the page shows nowhere (attached by an
 * agent with files_attach, or from before files went into the text) must
 * still be reachable, so those, and only those, are listed, and the list
 * goes once nothing is left in it. An HTML artifact's page files are listed
 * there too, by their paths. Pure rules, tested without a browser.
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

/** The name of every control that attaches a file beside an artifact's content: both More menus, and the list's heading. */
export const ATTACH_FILE_LABEL = "Attach file";

/** The name of the same controls on a web page (`html`), where a file goes to the page or beside it by its type. */
export const ADD_FILES_LABEL = "Add files";

/** The name of the controls that take files beside an artifact's content, for its format. */
export function attachLabel(kind: string): string {
  return kind === "html" ? ADD_FILES_LABEL : ATTACH_FILE_LABEL;
}

/** What the list says while files are held over the page: where a drop will put them. */
export function dropHint(kind: string): string {
  return kind === "html" ? "Drop to add them to this page" : "Drop to attach it to this artifact";
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

function counted(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${String(count)} ${many}`;
}

/**
 * The words beside the list's heading: how many files, and why they are
 * listed. A page file (one with a path, which an HTML artifact's page loads
 * by that path) is named as one, never as "not shown on the page".
 */
export function looseFilesWords(files: readonly { pagePath?: string | undefined }[]): string {
  const pageFiles = files.filter((file) => file.pagePath !== undefined).length;
  const others = files.length - pageFiles;
  if (files.length === 0) return "";
  if (others === 0) return counted(pageFiles, "page file", "page files");
  if (pageFiles === 0) return `${counted(others, "file", "files")}, not shown on the page`;
  return `${counted(pageFiles, "page file", "page files")} and ${counted(others, "file", "files")} not shown on the page`;
}

/**
 * True when a person attaches files beside this format's content on the
 * web ("Attach file", and a drop anywhere on the page): every format with
 * the quiet list but a document, whose files go into its text. An HTML
 * artifact's are plain attachments too; its page files come from agents.
 */
export function attachesBeside(kind: string): boolean {
  return filesPanel(kind) === "list" && kind !== "markdown";
}

/** True when a file can be put into a document's text from the list: only a document has text for it. */
export function addsToDocument(kind: string): boolean {
  return kind === "markdown";
}
