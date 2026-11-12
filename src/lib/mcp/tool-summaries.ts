import { toolAccess, type McpToolName } from "./tool-access";

/**
 * A one-line, plain-English summary of every MCP tool, for people reading the
 * Connections page. The type makes a tool added to `toolAccess` without a
 * summary fail typecheck, and `tool-summaries.test.ts` checks the same at
 * runtime, so the page cannot drift from what the server registers.
 */
export const toolSummaries = {
  artifacts_list: "List and search artifacts by text, project, or team.",
  artifacts_get: "Read one artifact in full.",
  teams_list: "List your teams, your role, and how sharing is approved.",
  projects_list: "List your or a team's projects, with how many artifacts each holds.",
  tags_list: "List the tags in use in your or a team's artifacts, most used first.",
  artifacts_create: "Create an artifact with a title, format, project, and content.",
  artifacts_update: "Change an artifact in place. Every save is kept.",
  artifacts_delete: "Delete an artifact you wrote.",
  artifacts_versions: "List an artifact's saved versions, or read one.",
  artifacts_restore_version: "Bring back an older version as a new save.",
  artifacts_views: "See how many people read a public artifact you can edit.",
  artifacts_formats_guide: "Explain each format, with the component guide for rich pages.",
  artifacts_validate: "Check content against a format without saving it.",
  themes_list: "List the theme presets and cover gradients an artifact can use.",
  files_get_download_url: "Get a short-lived link to download a file.",
  files_request_upload: "Start a file upload and get a link to send it to.",
  files_finalize: "Check an uploaded file and make it usable.",
  files_create_artifact: "Create an artifact that holds uploaded files.",
  files_attach: "Add uploaded files to an artifact you can edit.",
  files_replace: "Replace a file with a new upload, keeping the old one in History.",
  files_delete: "Delete an upload, or a file on an artifact you can edit.",
  inbox_list: "List unread @mentions with the thread around them.",
  comments_list: "Read the comment thread on an artifact.",
  inbox_mark_read: "Mark mentions read once handled.",
  comment_create: "Comment or reply, with @mentions, on the whole artifact or on its words.",
  comment_update: "Edit a comment you wrote.",
  comment_delete: "Delete a comment you wrote.",
} as const satisfies Record<McpToolName, string>;

/** One row of the tools table on the Connections page. */
export interface ToolRow {
  name: McpToolName;
  access: "read" | "write";
  summary: string;
}

/** Every MCP tool with its access level and summary, in `toolAccess` order. */
export function toolRows(): ToolRow[] {
  return (Object.keys(toolAccess) as McpToolName[]).map((name) => ({
    name,
    access: toolAccess[name],
    summary: toolSummaries[name],
  }));
}
