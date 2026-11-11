import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

import type { McpAccess } from "@/lib/oauth/scopes";

/**
 * Every MCP tool, classified. "read" tools only look; "write" tools create,
 * change, delete, share, comment, upload, or mark something. A read-only
 * connection never sees write tools. A tool missing from this list cannot be
 * registered at all, so a new tool can never default to allowed.
 */
export const toolAccess = {
  // Artifacts
  artifacts_list: "read",
  artifacts_get: "read",
  teams_list: "read",
  projects_list: "read",
  tags_list: "read",
  artifacts_create: "write",
  artifacts_update: "write",
  artifacts_delete: "write",
  // Version history: editors only.
  artifacts_versions: "read",
  artifacts_restore_version: "write",
  // View counts of public artifacts: editors only.
  artifacts_views: "read",
  // Formats: guidance and dry-run validation, nothing is saved.
  artifacts_formats_guide: "read",
  artifacts_validate: "read",
  // Themes: the built-in presets an artifact's `theme` can name.
  themes_list: "read",
  // Files
  files_get_download_url: "read",
  files_request_upload: "write",
  files_finalize: "write",
  files_create_artifact: "write",
  files_attach: "write",
  files_delete: "write",
  // Inbox and comments
  inbox_list: "read",
  comments_list: "read",
  inbox_mark_read: "write",
  comment_create: "write",
  comment_update: "write",
  comment_delete: "write",
} as const satisfies Record<string, "read" | "write">;

export type McpToolName = keyof typeof toolAccess;

/** The tools classified "write" in toolAccess. */
export type WriteToolName = { [Name in McpToolName]: (typeof toolAccess)[Name] extends "write" ? Name : never }[McpToolName];

/** What a write does, for the MCP annotations clients use to decide when to ask the person first. */
interface WriteTraits {
  /** It deletes or replaces something (MCP `destructiveHint`). False when it only adds. */
  destructive: boolean;
  /** A second call with the same arguments changes nothing more (MCP `idempotentHint`). */
  idempotent: boolean;
}

/**
 * How each write tool changes things. The type needs every write tool and no
 * other, so a new write tool cannot ship without saying whether it is
 * destructive. Idempotent is true only where the code makes a repeat a no-op.
 */
export const writeTraits = {
  // A new artifact on every call.
  artifacts_create: { destructive: false, idempotent: false },
  // Replaces content, tags, and sharing; a repeat can file a version or a sharing request.
  artifacts_update: { destructive: true, idempotent: false },
  artifacts_delete: { destructive: true, idempotent: true },
  // Replaces the current content with an older version, as a new save each time.
  artifacts_restore_version: { destructive: true, idempotent: false },
  // A new pending upload on every call.
  files_request_upload: { destructive: false, idempotent: false },
  // Finalizing a ready file returns it unchanged. It removes only an upload that failed its checks, which was never usable.
  files_finalize: { destructive: false, idempotent: true },
  files_create_artifact: { destructive: false, idempotent: false },
  // Attaches only files not yet attached, so a repeat attaches nothing.
  files_attach: { destructive: false, idempotent: true },
  files_delete: { destructive: true, idempotent: true },
  inbox_mark_read: { destructive: false, idempotent: true },
  comment_create: { destructive: false, idempotent: false },
  // Replaces the body; mentions it already notified are not notified again.
  comment_update: { destructive: true, idempotent: true },
  comment_delete: { destructive: true, idempotent: true },
} as const satisfies Record<WriteToolName, WriteTraits>;

const classified = new Map<string, "read" | "write">(Object.entries(toolAccess));
const traits = new Map<string, WriteTraits>(Object.entries(writeTraits));

/** The access level of a tool. Throws for a tool nobody classified. */
function levelOf(name: string): "read" | "write" {
  const level = classified.get(name);
  if (!level) throw new Error(`MCP tool "${name}" has no access level. Add it to toolAccess in src/lib/mcp/tool-access.ts.`);
  return level;
}

/** Whether a connection with `access` may use the tool. Throws for a tool nobody classified. */
export function toolAllowed(name: string, access: McpAccess): boolean {
  return levelOf(name) === "read" || access === "full";
}

/**
 * The MCP annotations a tool lists with, derived from toolAccess and
 * writeTraits. Read tools say `readOnlyHint: true`, which ChatGPT needs to run
 * them without asking and to offer them at all on plans that allow only
 * read-only tools. Every tool acts only inside artifacts.space, so
 * `openWorldHint` is false. Throws for a tool nobody classified.
 */
export function toolAnnotations(name: string): ToolAnnotations {
  if (levelOf(name) === "read") return { readOnlyHint: true, openWorldHint: false };
  const write = traits.get(name);
  if (!write) throw new Error(`MCP write tool "${name}" has no traits. Add it to writeTraits in src/lib/mcp/tool-access.ts.`);
  return { readOnlyHint: false, destructiveHint: write.destructive, idempotentHint: write.idempotent, openWorldHint: false };
}

/** What tool registration needs from an McpServer. */
export type ToolServer = Pick<McpServer, "registerTool">;

/**
 * The server the tool registration functions use: the same McpServer, but
 * every tool gets its annotations from toolAnnotations, and a tool the
 * connection may not use is removed as soon as it is registered, so it never
 * appears in tools/list and a call to it is refused as unknown. A tool that
 * sets its own annotations is refused, so this file stays the one source.
 */
export function gateTools(server: ToolServer, access: McpAccess): ToolServer {
  const registerTool: McpServer["registerTool"] = (name, config, handler) => {
    const allowed = toolAllowed(name, access);
    if (config.annotations) throw new Error(`MCP tool "${name}" sets its own annotations. They come from src/lib/mcp/tool-access.ts.`);
    const registered = server.registerTool(name, { ...config, annotations: toolAnnotations(name) }, handler);
    if (!allowed) registered.remove();
    return registered;
  };
  return { registerTool };
}

/** Server instructions added for read-only connections, so agents know why write tools are missing. */
export const READ_ONLY_INSTRUCTIONS =
  "This connection is read-only: you can list, read, and search artifacts, comments, and files, but you cannot create, change, delete, share, comment, or upload. If the person wants changes, ask them to reconnect with full access.";
