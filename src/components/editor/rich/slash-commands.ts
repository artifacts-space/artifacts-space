import {
  IconBlockquote,
  IconCode,
  IconFile,
  IconFileTypePdf,
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconMinus,
  IconMovie,
  IconMusic,
  IconPhoto,
  IconSitemap,
  IconTable,
  type Icon,
} from "@tabler/icons-react";
import type { ChainedCommands, Editor, Range } from "@tiptap/core";

import type { MediaKind } from "@/lib/files/media-rules";

import { emptyMediaAttrs, MEDIA_NODE } from "./media-markdown";

/** Inserts an empty media block of `kind`; it offers an upload or a link. */
function insertMedia(chain: ChainedCommands, kind: MediaKind): ChainedCommands {
  return chain.insertContent({ type: MEDIA_NODE, attrs: emptyMediaAttrs(kind) });
}

/** One block the slash menu can insert. */
export interface SlashCommand {
  id: string;
  title: string;
  hint: string;
  keywords: readonly string[];
  icon: Icon;
  apply: (chain: ChainedCommands) => ChainedCommands;
}

/** Every block the slash menu offers, in menu order. */
export const slashCommands: readonly SlashCommand[] = [
  { id: "h1", title: "Heading 1", hint: "#", keywords: ["title", "h1"], icon: IconH1, apply: (chain) => chain.setNode("heading", { level: 1 }) },
  { id: "h2", title: "Heading 2", hint: "##", keywords: ["subtitle", "h2"], icon: IconH2, apply: (chain) => chain.setNode("heading", { level: 2 }) },
  { id: "h3", title: "Heading 3", hint: "###", keywords: ["h3"], icon: IconH3, apply: (chain) => chain.setNode("heading", { level: 3 }) },
  { id: "bullet", title: "Bulleted list", hint: "-", keywords: ["ul", "unordered", "bullet"], icon: IconList, apply: (chain) => chain.toggleBulletList() },
  { id: "ordered", title: "Numbered list", hint: "1.", keywords: ["ol", "ordered", "number"], icon: IconListNumbers, apply: (chain) => chain.toggleOrderedList() },
  { id: "task", title: "Task list", hint: "[ ]", keywords: ["todo", "checkbox", "check"], icon: IconListCheck, apply: (chain) => chain.toggleTaskList() },
  { id: "quote", title: "Quote", hint: ">", keywords: ["blockquote", "citation"], icon: IconBlockquote, apply: (chain) => chain.toggleBlockquote() },
  { id: "code", title: "Code block", hint: "```", keywords: ["pre", "snippet", "fence"], icon: IconCode, apply: (chain) => chain.toggleCodeBlock() },
  { id: "mermaid", title: "Mermaid diagram", hint: "```mermaid", keywords: ["mermaid", "diagram", "flowchart", "chart", "code"], icon: IconSitemap, apply: (chain) => chain.setCodeBlock({ language: "mermaid" }) },
  { id: "table", title: "Table", hint: "3×3", keywords: ["grid", "columns", "rows"], icon: IconTable, apply: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  { id: "divider", title: "Divider", hint: "---", keywords: ["hr", "rule", "separator", "line"], icon: IconMinus, apply: (chain) => chain.setHorizontalRule() },
  { id: "image", title: "Image", hint: "![]", keywords: ["image", "picture", "photo", "screenshot", "img"], icon: IconPhoto, apply: (chain) => insertMedia(chain, "image") },
  { id: "video", title: "Video", hint: "#video", keywords: ["video", "movie", "mp4", "recording"], icon: IconMovie, apply: (chain) => insertMedia(chain, "video") },
  { id: "audio", title: "Audio", hint: "#audio", keywords: ["audio", "sound", "mp3", "podcast", "voice"], icon: IconMusic, apply: (chain) => insertMedia(chain, "audio") },
  { id: "pdf", title: "PDF", hint: "#pdf", keywords: ["pdf", "document", "report"], icon: IconFileTypePdf, apply: (chain) => insertMedia(chain, "pdf") },
  { id: "file", title: "File", hint: "#file", keywords: ["file", "attachment", "upload", "download"], icon: IconFile, apply: (chain) => insertMedia(chain, "file") },
];

const mediaCommandIds = new Set(["image", "video", "audio", "pdf", "file"]);

/** The text blocks only, for editors that can't hold media (a ui artifact's Markdown block). */
export const textSlashCommands: readonly SlashCommand[] = slashCommands.filter((command) => !mediaCommandIds.has(command.id));

/** The commands an editor offers: every block, or text blocks only when `media` is false. */
export function slashCommandsFor(media: boolean): readonly SlashCommand[] {
  return media ? slashCommands : textSlashCommands;
}

/**
 * The commands that match what was typed after the slash, by title,
 * keyword, or Markdown hint. An empty query matches everything.
 */
export function filterSlashCommands(query: string, commands: readonly SlashCommand[] = slashCommands): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...commands];
  return commands.filter(
    (command) =>
      command.title.toLowerCase().includes(needle) ||
      command.hint === needle ||
      command.keywords.some((keyword) => keyword.startsWith(needle)),
  );
}

/** Replaces the typed `/query` with the chosen block. */
export function runSlashCommand(editor: Editor, range: Range, command: SlashCommand): void {
  command.apply(editor.chain().focus().deleteRange(range)).run();
}

/** Inserts a block at the cursor, for the touch toolbar's Insert menu. */
export function insertBlock(editor: Editor, command: SlashCommand): void {
  command.apply(editor.chain().focus()).run();
}
