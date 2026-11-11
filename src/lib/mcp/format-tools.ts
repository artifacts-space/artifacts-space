import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { validateArtifactContent } from "@/lib/artifact-content";
import { blockHues } from "@/lib/block-colors/block-color-rules";
import { formatInfo, type FormatKind } from "@/lib/artifact-formats";
import { artifactKinds } from "@/lib/artifact-types";
import type { McpAccess } from "@/lib/oauth/scopes";
import { buildUiGuide } from "@/lib/ui/guide";

import { gateTools } from "./tool-access";

/** Describes the `kind` field for agents on create and update. Lists only formats the server accepts. */
export const kindFieldDescription = [
  "Format of the content. Defaults to markdown.",
  ...artifactKinds.map((kind) => `${kind}: ${formatInfo[kind].agent}`),
].join("\n");

/** How agents set an artifact's page icon, in any format. */
export const ICON_GUIDE =
  'Any format can carry a page icon beside its title: set `icon` on artifacts_create or artifacts_update to one emoji (such as "🧪") or "tabler:<name>" (such as "tabler:rocket"; the field description lists every allowed name). Pass null or "" on update to remove it.';

/** How agents set an artifact's cover, in any format. */
export const COVER_GUIDE =
  'Any format can carry a slim cover banner above it: set `cover` on artifacts_create or artifacts_update to a gradient id from themes_list (such as "mist"), or to "file:<file id>" for an uploaded image, with an optional `coverPosition` (0 top to 100 bottom). Pass null or "" on update to remove it.';

/** How agents set an artifact's theme, in any format. */
export const THEME_GUIDE =
  'Any format can carry a theme (colors, fonts, and corner radius for the artifact and the page behind it): set `theme` on artifacts_create or artifacts_update to a preset id from themes_list (such as "paper"), or to theme JSON (see /docs/themes). Pass null or "" on update to remove it.';

/** How agents embed uploaded files in Markdown: the media block form from markdown-dialect.md. */
export const MARKDOWN_MEDIA_GUIDE = [
  "Embed uploaded files in Markdown:",
  "1) Upload the file: files_request_upload, PUT the bytes, then files_finalize. Keep the file id.",
  "2) Put a media block on its own line, with a blank line before and after it:",
  "   ![Alt text](/api/files/<file id>)",
  '   ![Alt text](/api/files/<file id> "Caption under the image")',
  "3) Add options after # to change how it shows, joined with &:",
  "   #width=60 sets the width in percent of the text column (10 to 100). Images and video only. Phones always use the full width.",
  "   #video, #audio, or #pdf shows a player or the PDF viewer. #file shows a download card. Leave the kind out for an image.",
  "   Example: ![Product walkthrough](/api/files/<file id>#video&width=80 \"Two minutes\")",
  "For video, audio, and PDFs, the text in the brackets is the name people see.",
  "Saving the artifact attaches your finished uploads that it names. You do not need files_attach. Readers can open a file only when they can read the artifact version that shows it.",
  "To change an embedded file, upload the new one and point the block at its id; History keeps the old one. files_replace is for files attached with files_attach or the Files section.",
  "Use the relative path /api/files/<file id>, not a full URL. Images from other sites never load: they show as their alt text.",
  "Keep the image alone on its line. An image inside a sentence shows inline, and the editor keeps that paragraph as written.",
].join("\n");

/** How agents put diagrams in Markdown: a fenced mermaid block, drawn in place (markdown-dialect.md). */
export const MARKDOWN_DIAGRAM_GUIDE = [
  "Draw diagrams in Markdown with a fenced mermaid block. It shows as the diagram, in the document's place, for every reader:",
  "```mermaid",
  "flowchart TD",
  "  A[Plan] --> B{Approved?}",
  "  B -->|Yes| C[Ship]",
  "```",
  "Start the source with the diagram type (flowchart TD, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, mindmap). Keep the diagram in the document: do not publish it as a separate mermaid artifact and link to it.",
  "The Markdown keeps the fenced source exactly as written, so you read and edit it as text. If Mermaid cannot read it, readers see the source as code with a short note. artifacts_validate with kind \"mermaid\" checks that it starts with a diagram type.",
].join("\n");

/** How agents color lines in Markdown: a color comment at the end of the line's text (markdown-dialect.md, "Block colors"). */
export const MARKDOWN_COLOR_GUIDE = [
  "Color a paragraph, heading, list item, or quoted line by ending its text with a color comment:",
  "   Ship it on Friday <!-- color: red -->",
  "   ## Open questions <!-- background: yellow -->",
  "   - [ ] Call the venue <!-- color: blue; background: gray -->",
  `Hues: ${blockHues.join(", ")}. "color" sets the text color and "background" the background; write color first. Leave the comment out for the default.`,
  "Other Markdown readers hide the comment. Keep it at the end of the line's text: a comment in the middle of text, or with another name or hue, does not color anything.",
].join("\n");

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/** The guide for one format, or an overview of all formats. */
export function formatGuide(kind?: FormatKind): string {
  if (kind === "ui") return buildUiGuide();
  if (kind === "markdown") return `${formatInfo.markdown.label} (markdown): ${formatInfo.markdown.agent}\n\n${MARKDOWN_DIAGRAM_GUIDE}\n\n${MARKDOWN_MEDIA_GUIDE}\n\n${MARKDOWN_COLOR_GUIDE}`;
  if (kind) return `${formatInfo[kind].label} (${kind}): ${formatInfo[kind].agent}`;
  const lines = artifactKinds.map((item) => `- ${item}: ${formatInfo[item].agent}`);
  const uiHint = (artifactKinds as readonly string[]).includes("ui") ? ['', 'For rich pages, call artifacts_formats_guide with kind "ui" to get the component reference and an example.'] : [];
  return ["Artifact formats:", ...lines, ...uiHint, "", ICON_GUIDE, "", THEME_GUIDE, "", COVER_GUIDE].join("\n");
}

/** Validation feedback for agents, in plain text. */
export function validationReport(kind: FormatKind, content: string): string {
  const result = validateArtifactContent(kind, content);
  if (result.issues.length === 0) return `Valid ${kind} content. It is ready to save.`;
  const verdict = result.valid ? `Valid ${kind} content, with warnings:` : `Invalid ${kind} content. Fix these and validate again:`;
  return `${verdict}\n${result.message}`;
}

/**
 * Registers the format tools on an MCP server:
 * - artifacts_formats_guide: what each format is, and the full ui component guide.
 * - artifacts_validate: checks content against a format without saving it.
 */
export function registerFormatTools(server: McpServer, access: McpAccess) {
  const gated = gateTools(server, access);
  gated.registerTool(
    "artifacts_formats_guide",
    {
      title: "Artifact formats guide",
      description: "Explains every artifact format. With kind \"ui\", returns the component reference, rules, and an example for rich pages. Read it before creating a ui artifact.",
      inputSchema: { kind: z.enum(artifactKinds).optional().describe("Format to explain. Omit for an overview.") },
    },
    ({ kind }) => text(formatGuide(kind)),
  );

  gated.registerTool(
    "artifacts_validate",
    {
      title: "Validate artifact content",
      description: "Checks content against a format without saving it. Reports every problem at once, naming the element and the fix.",
      inputSchema: {
        kind: z.enum(artifactKinds),
        content: z.string().max(1_000_000),
      },
    },
    ({ kind, content }) => text(validationReport(kind, content)),
  );
}
