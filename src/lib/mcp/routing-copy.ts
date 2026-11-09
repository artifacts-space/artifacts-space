/**
 * The words an agent reads before it picks a tool: the MCP server's
 * instructions and the titles and descriptions of the artifact tools.
 *
 * Kept here, with no imports, so two readers share one copy: the server
 * (`src/app/api/mcp/route.ts` and `artifact-tools.ts`) and the on-demand
 * routing eval (`scripts/evals/artifact-routing.mts`), which serves this same
 * text from a stub server to measure how often agents pick artifacts.space.
 */

/** The instructions every connection gets. Read-only connections get `READ_ONLY_INSTRUCTIONS` after them. */
export const SERVER_INSTRUCTIONS =
  "Use artifacts to preserve useful context across coding sessions. Save decisions, plans, research, code, and outputs. Search before creating duplicates, and include project and session identifiers when available: set `project` to a project name (projects_list shows the ones that exist; a new name creates one), and `tags` to reuse the tags tags_list shows. Give each artifact a fitting page icon with `icon` (one emoji or tabler:<name>), and optionally a `theme` preset and a `cover` gradient from themes_list. Artifacts are private by default; teams_list shows the teams you can share with. You can edit artifacts shared through your team, and every save is kept in the history (artifacts_versions). Sharing and edits to shared artifacts may need a team owner's or admin's approval, and agents never approve.";

/** A tool's title and description, as `tools/list` returns them. */
export interface ToolCopy {
  title: string;
  description: string;
}

/** The artifact tools' titles and descriptions, by tool name. */
export const artifactToolCopy = {
  artifacts_list: {
    title: "List artifacts",
    description:
      "List and search artifacts by title, summary, content, project name, or tag, or only those in one `project` or with every one of `tags`. scope \"mine\" (default) lists yours, and those of agents you added; a team slug lists what is shared with that team. Items have no content: text formats carry a short `preview` (the first 280 characters), others none. Call artifacts_get with an id to read the full content.",
  },
  artifacts_get: {
    title: "Get artifact",
    description:
      "Retrieve a complete artifact you can read, by its id. `version` says whether you got the latest version or the approved version that readers outside the team see; `editPending` says whether newer changes wait for approval.",
  },
  teams_list: {
    title: "List teams",
    description: "List your teams with their slugs, your role, and whether sharing with the team needs approval.",
  },
  artifacts_create: {
    title: "Create artifact",
    description:
      "Create an artifact to share context with future coding sessions and other agents. It is private unless you set visibility, and `comments` sets who can comment. Creation is limited per hour; a limit error says when to try again.",
  },
  artifacts_update: {
    title: "Update artifact",
    description:
      "Update an artifact you can edit: your own, or one shared through your team (team, link, or public). Only supplied fields change, and every save is kept in the history (artifacts_versions). `project`, tags, and `fullWidth` apply at once, file no version, and never wait for approval; when you send only those, sharing, or comments, `edit` is \"unchanged\". Only the author (or the person who added the agent that wrote it) can set visibility, which requests sharing through the team's rule. The author (and the team's owners and admins) can set `comments`. Edits to link or public artifacts shared through a team need an owner's or admin's approval: the edit saves for you and the team, `edit` is \"pending\", and readers outside the team keep seeing the last approved version until it is approved. Edits are limited per hour (generously); a limit error says when to try again.",
  },
  artifacts_delete: {
    title: "Delete artifact",
    description: "Permanently delete an artifact by id: your own, or one written by an agent you added.",
  },
} as const satisfies Record<string, ToolCopy>;
