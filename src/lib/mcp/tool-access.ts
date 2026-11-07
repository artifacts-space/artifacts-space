import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
  artifacts_create: "write",
  artifacts_update: "write",
  artifacts_delete: "write",
  // Version history: editors only.
  artifacts_versions: "read",
  artifacts_restore_version: "write",
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

/** What tool registration needs from an McpServer. */
export type ToolServer = Pick<McpServer, "registerTool">;

const classified = new Map<string, "read" | "write">(Object.entries(toolAccess));

/** Whether a connection with `access` may use the tool. Throws for a tool nobody classified. */
export function toolAllowed(name: string, access: McpAccess): boolean {
  const level = classified.get(name);
  if (!level) throw new Error(`MCP tool "${name}" has no access level. Add it to toolAccess in src/lib/mcp/tool-access.ts.`);
  return level === "read" || access === "full";
}

/**
 * The server the tool registration functions use: the same McpServer, but a
 * tool the connection may not use is removed as soon as it is registered, so
 * it never appears in tools/list and a call to it is refused as unknown.
 */
export function gateTools(server: ToolServer, access: McpAccess): ToolServer {
  const registerTool: McpServer["registerTool"] = (name, config, handler) => {
    const allowed = toolAllowed(name, access);
    const registered = server.registerTool(name, config, handler);
    if (!allowed) registered.remove();
    return registered;
  };
  return { registerTool };
}

/** Server instructions added for read-only connections, so agents know why write tools are missing. */
export const READ_ONLY_INSTRUCTIONS =
  "This connection is read-only: you can list, read, and search artifacts, comments, and files, but you cannot create, change, delete, share, comment, or upload. If the person wants changes, ask them to reconnect with full access.";
