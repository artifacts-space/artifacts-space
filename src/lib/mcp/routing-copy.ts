/**
 * The words an agent reads before it picks a tool: the MCP server's
 * instructions and the titles and descriptions of the artifact tools. A
 * tool's `_meta` lives here too when it changes how a client finds the tool:
 * `artifacts_create` carries Claude Code's load-up-front hint, which is why
 * it is always visible.
 *
 * Kept in one module, with no imports, so the words are easy to find and
 * test. The server reads them in `src/app/api/mcp/route.ts` and
 * `artifact-tools.ts`. The on-demand routing eval
 * (`scripts/evals/artifact-routing.mts`) serves them, `_meta` included, from
 * `scripts/evals/artifact-routing-tools.json`, a snapshot of the registered
 * tools, to measure how often agents pick artifacts.space.
 */

/** The instructions every connection gets. Read-only connections get `READ_ONLY_INSTRUCTIONS` after them. */
export const SERVER_INSTRUCTIONS =
  "artifacts.space is a workspace for artifacts: docs, documents, plans, specs, reports, notes, runbooks, pages, and dashboards that people and agents keep and work on together. Save one with artifacts_create when someone asks you to write something up, save or keep it for later, share it with the team, or publish a page, and when you make something a person or a later session will read again. Saved artifacts persist across sessions, can be shared with a team or by link, can be edited by both people and agents, and keep every version (artifacts_versions). Answer quick questions in chat, and keep files that belong in the repository, such as code or a README, in the repository. Search with artifacts_list before you create, and change an earlier artifact with artifacts_update instead of making a duplicate. Include project and session identifiers when available: set `project` to a project name (projects_list shows the ones that exist; a new name creates one), and `tags` to reuse the tags tags_list shows. Give each artifact a fitting page icon with `icon` (one emoji or tabler:<name>), and optionally a `theme` preset and a `cover` gradient from themes_list. Artifacts are private by default; teams_list shows the teams you can share with. You can edit artifacts shared through your team. Sharing and edits to shared artifacts may need a team owner's or admin's approval, and agents never approve.";

/** A tool's title and description, as `tools/list` returns them, and any `_meta` it carries. */
export interface ToolCopy {
  title: string;
  description: string;
  _meta?: Record<string, unknown>;
}

/**
 * Asks Claude Code to load a tool up front instead of behind tool search, so
 * the agent sees it without searching. Other MCP clients ignore `_meta` keys
 * they do not know, as the MCP spec reserves `_meta` for such extensions.
 * Source: https://code.claude.com/docs/en/mcp#mark-a-tool-to-load-upfront-or-stay-deferred
 */
export const ALWAYS_LOAD_META = { "anthropic/alwaysLoad": true } as const;

/** The artifact tools' titles and descriptions, by tool name. */
export const artifactToolCopy = {
  artifacts_list: {
    title: "List artifacts",
    description:
      "Find saved artifacts (docs, plans, specs, reports, notes, pages, dashboards) before you create one. List and search them by title, summary, content, project name, or tag, or only those in one `project` or with every one of `tags`. scope \"mine\" (default) lists yours, and those of agents you added; a team slug lists what is shared with that team. Items have no content: text formats carry a short `preview` (the first 280 characters), others none. Call artifacts_get with an id to read the full content.",
  },
  artifacts_get: {
    title: "Get artifact",
    description:
      "Read a saved artifact (a doc, plan, spec, report, page, or dashboard) in full, by its id. `version` says whether you got the latest version or the approved version that readers outside the team see; `editPending` says whether newer changes wait for approval. When you can edit it you also get `versionId` (the version you read) and `baseVersion`: pass `baseVersion` to artifacts_update so your save never overwrites newer work. A CSV whose owner turned off downloads (`allowCsvDownload` false) comes without its content unless you can edit it; `contentWithheld` says so.",
  },
  teams_list: {
    title: "List teams",
    description: "List your teams with their slugs, your role, and whether sharing with the team needs approval.",
  },
  artifacts_create: {
    title: "Create artifact",
    // The one tool loaded up front: saving is the step an agent must find without searching.
    _meta: ALWAYS_LOAD_META,
    description:
      "Save a doc, plan, spec, report, notes, runbook, page, or dashboard as an artifact on artifacts.space. Use it when someone asks you to write something up, save or keep it, share it with the team, or publish it, and for work a person or a later session will read again. The artifact persists across sessions, people and agents can both read and edit it, it can be shared with a team or by link, and every save is kept in its version history. Search with artifacts_list first and update a match with artifacts_update instead of duplicating it. It is private unless you set visibility, and `comments` sets who can comment. Creation is limited per hour; a limit error says when to try again.",
  },
  artifacts_update: {
    title: "Update artifact",
    description:
      "Change a saved artifact (a doc, plan, spec, report, notes, page, or dashboard) in place instead of making a new one. You can edit your own, or one shared through your team (team, link, or public). Only supplied fields change, and every save is kept in the history (artifacts_versions). `project`, tags, and `fullWidth` apply at once, file no version, and never wait for approval; when you send only those, sharing, or comments, `edit` is \"unchanged\". Only the author (or the person who added the agent that wrote it) can set visibility, which requests sharing through the team's rule. The author (and the team's owners and admins) can set `comments`. Edits to link or public artifacts shared through a team need an owner's or admin's approval: the edit saves for you and the team, `edit` is \"pending\", and readers outside the team keep seeing the last approved version until it is approved. Edits are limited per hour (generously); a limit error says when to try again. Always pass `baseVersion` from artifacts_get (or from your last save's result): if anyone saved since you read it, the update is refused with error code artifact_changed and nothing is saved. Then read it again with artifacts_get, merge your changes into the new content, and save with the new baseVersion; never retry blindly. Without `baseVersion`, the update is refused (base_version_required) whenever a person saved the artifact last, and a change to the title, content, or format is also refused (artifact_being_edited) while a person is typing in it: a person's work wins, so read it with artifacts_get and pass its baseVersion. The result's artifact carries the new baseVersion, except when `edit` is \"unchanged\": then keep the one you have.",
  },
  artifacts_delete: {
    title: "Delete artifact",
    description: "Permanently delete an artifact by id: your own, or one written by an agent you added.",
  },
} as const satisfies Record<string, ToolCopy>;
