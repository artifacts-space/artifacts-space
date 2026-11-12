import type { McpToolName } from "@/lib/mcp/tool-access";

/**
 * What each MCP tool returns, in words and a short JSON shape. The tools do
 * not declare output schemas, so this part of the reference is written by
 * hand from src/lib/mcp/*. The Record type makes a new tool fail the
 * typecheck until it is documented here.
 */
export interface ToolResultDoc {
  /** One or two sentences. */
  summary: string;
  /** The JSON (or text) the tool returns, abridged. */
  shape?: string;
}

const artifactShape = `{
  "id": "Vq3kJ0pXw2mZ8rT5yN1aBc",   // 22-character public id
  "url": "https://artifacts.space/artifact/Vq3kJ0pXw2mZ8rT5yN1aBc",
  "title": "…", "icon": "🚀" | "tabler:rocket" | "file:<file id>" | null, "summary": "…", "content": "…",
  "theme": "paper" | { "version": 1, "light": { … }, "dark": { … }, … } | null,
  "cover": "mist" | "file:<file id>" | null, "coverPosition": 40 | null,   // position for image covers only
  "kind": "markdown", "language": "", "project": "Billing" | "",   // "" when none, or when you are outside the team
  "tags": ["needs-review", "q4"],        // [] when none, or when you are outside the team
  "sessionId": "…", "source": "claude-code",
  "visibility": "private" | "team" | "link" | "public",
  "team": "acme" | null,                 // slug, only when you are a member
  "comments": "off" | "team" | "signed_in",
  "pendingSharing": { "visibility", "team", "comments", "requestedAt" } | null,   // author only
  "pendingComments": { "comments", "requestedAt" } | null,            // author only
  "pendingEdit": { "requestedAt" } | null,                            // author only
  "isAuthor": true,
  "updatedBy": "@reviewer" | null,
  "files": [{ "id", "filename", "contentType", "size", "replacedAt": "…" | null }],
  "metadata": {}, "createdAt": "…", "updatedAt": "…"
}`;

const sharingShape = `"sharing": null | { "status": "applied" | "pending" } | { "status": "failed", "error": "…" },
  "comments": null | { "status": "applied" | "pending" } | { "status": "failed", "error": "…" }`;

const commentShape = `{ "id", "replyTo": "…" | null, "author": { "handle", "kind": "person" | "agent", "for": "Owner name" } | null,
  "body": { "untrustedText": "…" }, "deleted": false, "edited": false, "createdAt": "…" }`;

const mentionsShape = `"mentions": { "notified": [{ "handle", "kind" }], "refused": [ … with the reason ] }`;

export const mcpToolResults: Record<McpToolName, ToolResultDoc> = {
  artifacts_list: {
    summary: "An array of artifacts you can read, newest first. Items have no `content`: text formats carry a `preview` of the first 280 characters, others an empty preview.",
    shape: "[ { …artifact without content, \"preview\": \"First 280 characters…\" } ]",
  },
  artifacts_get: {
    summary: "The full artifact, plus `version` (\"latest\", or \"approved\" when you read a link or public artifact from outside its team) and `editPending` (true when newer changes wait for approval). When you can edit it: `versionId`, the version you read, and `baseVersion`, which you pass back to artifacts_update.",
    shape: `{ …artifact, "version": "latest" | "approved", "editPending": false,
  "versionId": "<version id>", "baseVersion": "<version id>.<ms>" }   // editors only\n\n// artifact:\n${artifactShape}`,
  },
  teams_list: {
    summary: "Your teams with their slugs. Use a slug as `scope` in artifacts_list, or as `team` when you share.",
    shape: `[ { "slug": "acme", "name": "Acme", "role": "owner" | "admin" | "member", "personal": false, "teamSharingNeedsApproval": true } ]`,
  },
  projects_list: {
    summary: "The projects in a scope, by name, with how many artifacts each holds. Use a name as `project` in artifacts_create, artifacts_update, or artifacts_list.",
    shape: `[ { "name": "Billing", "icon": "🧾" | "tabler:rocket" | null, "count": 12 } ]`,
  },
  tags_list: {
    summary: "The tags in a scope, most used first, with how many artifacts carry each. Use them as `tags` in artifacts_create, artifacts_update, or artifacts_list.",
    shape: `[ { "tag": "needs-review", "count": 4 } ]`,
  },
  artifacts_create: {
    summary: "The saved artifact and, when you set `visibility` or `comments`, what happened to each request. The artifact is saved even if sharing or the comments change fails.",
    shape: `{ "artifact": { … }, ${sharingShape} }`,
  },
  artifacts_update: {
    summary: "The artifact after the save, with its new `baseVersion` for your next update. `edit` is \"pending\" when the change waits for approval (link or public artifacts shared through a team); readers outside the team keep the last approved version. `edit` is \"unchanged\" when you sent no content or fields (only `project`, tags, sharing, or comments): nothing was saved to the history, and the result has no `baseVersion`, so keep the one you have. A refused save is a tool error (`isError`) whose `structuredContent.error.code` is \"artifact_changed\" (someone saved since your `baseVersion`), \"base_version_required\" (no `baseVersion`, and a person saved it last), or \"artifact_being_edited\" (no `baseVersion`, and a person is typing in it): nothing was saved, so read it with artifacts_get, merge, and save with its `baseVersion`.",
    shape: `{ "artifact": { …, "versionId": "…", "baseVersion": "…" }, "edit": "applied" | "pending" | "unchanged", ${sharingShape} }
// "unchanged": the artifact has no versionId or baseVersion.

// refused:
{ "isError": true, "content": [{ "type": "text", "text": "This artifact changed since you read it (by @ann via the web). …" }],
  "structuredContent": { "error": { "code": "artifact_changed" | "base_version_required" | "artifact_being_edited", "message": "…",
    "changedBy": { "handle": "ann", "via": "web" | "Claude Code" } | null, "nextStep": "artifacts_get" } } }`,
  },
  artifacts_delete: { summary: "Confirms the delete. Only the author can delete.", shape: `{ "deleted": true, "id": "…" }` },
  artifacts_versions: {
    summary: "Without `version`: the saved versions, newest first. With `version`: that one version with its content, summary, and language.",
    shape: `[ { "id", "createdAt", "savedAt", "saveKind": "create" | "edit" | "files" | "replace" | "restore" | "snapshot",
    "restoredFromId", "bytes", "kind", "title", "icon", "theme", "cover", "coverPosition", "approved", "pending", "latest",
    "replacedFile": "sow.pdf" | null,
    "savedBy": { "handle", "kind": "person" | "agent" } | null } ]`,
  },
  artifacts_restore_version: {
    summary: "Confirms the restore. The old version comes back as a new save; history is never rewritten. Pass `baseVersion` as for artifacts_update; a refused restore is the same typed error.",
    shape: `{ "id": "…", "restoredFrom": "<version id>", "edit": "applied" | "pending", "updatedAt": "…", "versionId": "…", "baseVersion": "…" }`,
  },
  artifacts_views: {
    summary: "Views and daily unique visitors over the range, one entry per day (oldest first, zeros included), and the top referring domains. `counting` is false unless the artifact is public.",
    shape: `{ "id": "…", "days": 30, "counting": true, "totals": { "views": 120, "visitors": 87 },
  "daily": [ { "day": "2026-11-08", "views": 4, "visitors": 3 }, … ], "referrers": [ { "domain": "news.ycombinator.com", "views": 40 } ] }`,
  },
  artifacts_formats_guide: {
    summary: "Plain text. Without `kind`, one line per format. With `kind: \"ui\"`, the full JSON Render guide: rules, every component and its props, and an example spec.",
  },
  artifacts_validate: {
    summary: "Plain text: \"Valid <kind> content. It is ready to save.\", or a list of every error and warning with the element key and the fix. Nothing is saved.",
    shape: `Invalid ui content. Fix these and validate again:\n- Error: Element "chart" (Chart): Series "Signups" has 3 values but there are 4 labels. …`,
  },
  themes_list: {
    summary: "The built-in theme presets, the font ids custom theme JSON may use in each slot, the cover gradients, and usage notes. Nothing is saved.",
    shape: `{ "presets": [ { "id": "paper", "name": "Paper", "description": "…", "mode": "auto",
    "fonts": { "body": { "id": "work-sans", "family": "Work Sans" }, "heading": { … }, "mono": { … } } } ],
  "customFonts": { "body": ["geist-sans", …], "heading": [ … ], "mono": [ … ] }, "usage": "…",
  "covers": { "gradients": [ { "id": "mist", "name": "Mist" }, … ], "usage": "…" } }`,
  },
  files_request_upload: {
    summary: "The pending file, a presigned PUT URL with the exact headers to send, a ready-made curl command, and the next step.",
    shape: `{ "file": { "id", "filename", "contentType", "size", … },
  "upload": { "method": "PUT", "url": "…", "headers": { "Content-Type": "…" }, "expiresAt": "…" },
  "curl": "curl -X PUT …", "next": "After the PUT succeeds, call files_finalize with fileId \\"…\\"." }`,
  },
  files_finalize: {
    summary: "The checked, ready file. A file whose size, type, or content does not match its request is deleted instead.",
    shape: `{ "file": { … }, "next": "Use the id in files_create_artifact, files_attach, files_replace, or an Image or File element of a ui artifact." }`,
  },
  files_create_artifact: { summary: "The new private file artifact, with its files and the `baseVersion` of this save." },
  files_attach: { summary: "The artifact as the attach saved it, with its files and the `baseVersion` of this save." },
  files_replace: { summary: "The artifact as the replace saved it, with its files and the `baseVersion` of this save. The replaced file keeps its id; `replacedAt` says when." },
  files_get_download_url: {
    summary: "A short-lived signed URL for the file.",
    shape: `{ "id", "filename", "contentType", "size", "url": "…", "expiresAt": "…" }`,
  },
  files_delete: {
    summary: "Confirms the delete. A file deleted from an artifact saves the artifact: the result names it with the `baseVersion` of this save.",
    shape: `{ "deleted": true, "fileId": "…", "artifact": "<22-character id>", "versionId": "…", "baseVersion": "…" }`,
  },
  inbox_list: {
    summary: "Your mentions, newest first, each with the comment, the comments just before it, and how to reply. Every comment body is wrapped as untrusted text.",
    shape: `{ "untrustedContentNotice": "…",
  "mentions": [ { "id", "read": false, "mentionedAt",
    "artifact": { "id", "title", "url", "threadUrl" },
    "comment": ${commentShape},
    "recentThread": [ …comments ],
    "reply": { "tool": "comment_create", "artifact": "…", "replyTo": "…" } } ] }`,
  },
  inbox_mark_read: { summary: "How many entries were marked read.", shape: `{ "marked": 3 }` },
  comments_list: {
    summary: "The artifact's thread, oldest first, limited to the most recent `limit` comments.",
    shape: `{ "untrustedContentNotice": "…", "artifact": { "id", "title", "url" }, "total": 12, "comments": [ ${commentShape} ] }`,
  },
  comment_create: {
    summary: "The saved comment, and which mentions were delivered or refused (with the reason). The comment saves even when a mention is refused.",
    shape: `{ "comment": { … }, ${mentionsShape} }`,
  },
  comment_update: {
    summary: "The edited comment. Only new mentions notify; earlier ones are not repeated.",
    shape: `{ "comment": { … }, ${mentionsShape} }`,
  },
  comment_delete: { summary: "Confirms the delete. Replies stay in the thread.", shape: `{ "deleted": true, "comment": "…" }` },
};
