import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { validateArtifactContent } from "@/lib/artifact-content";
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

/** How agents set an artifact's theme, in any format. */
export const THEME_GUIDE =
  'Any format can carry a theme (colors, fonts, and corner radius for the artifact and the page behind it): set `theme` on artifacts_create or artifacts_update to a preset id from themes_list (such as "paper"), or to theme JSON (see /docs/themes). Pass null or "" on update to remove it.';

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/** The guide for one format, or an overview of all formats. */
export function formatGuide(kind?: FormatKind): string {
  if (kind === "ui") return buildUiGuide();
  if (kind) return `${formatInfo[kind].label} (${kind}): ${formatInfo[kind].agent}`;
  const lines = artifactKinds.map((item) => `- ${item}: ${formatInfo[item].agent}`);
  const uiHint = (artifactKinds as readonly string[]).includes("ui") ? ['', 'For rich pages, call artifacts_formats_guide with kind "ui" to get the component reference and an example.'] : [];
  return ["Artifact formats:", ...lines, ...uiHint, "", ICON_GUIDE, "", THEME_GUIDE].join("\n");
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
