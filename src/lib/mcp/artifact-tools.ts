import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError } from "zod";

import { getViewableArtifact } from "@/lib/access";
import { filesForViewer } from "@/lib/files/download";
import { artifactKinds, artifactVisibilities, type ArtifactDto, type ArtifactVisibility } from "@/lib/artifact-types";
import {
  createArtifact,
  deleteArtifact,
  getOwnArtifactByPublicId,
  listArtifacts,
  toArtifactDtos,
  updateArtifact,
  type ArtifactScope,
} from "@/lib/artifacts";
import { kindFieldDescription } from "@/lib/mcp/format-tools";
import { isPublicId } from "@/lib/public-id";
import { requestArtifactSharing } from "@/lib/sharing/service";
import { siteUrl } from "@/lib/site-origin";
import { listTeamsForUser, type TeamMembership } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";

import { toMcpArtifact, type McpViewContext } from "./artifact-view";

const publicIdField = z.string().refine(isPublicId, "Use the artifact's 22-character id.").describe("Artifact id (22 characters)");
const visibilityField = z
  .enum(artifactVisibilities)
  .optional()
  .describe(
    "Who can read it. private: only you (default). team: members of `team`. link: anyone with the URL. public: anyone. Sharing follows the team's rule and may wait for an owner or admin to approve; agents cannot approve.",
  );
const teamField = z
  .string()
  .max(39)
  .optional()
  .describe("Team slug from teams_list. Required for team sharing. For link or public, the team whose admins approve it; defaults to your personal team.");

const editableFields = {
  title: z.string().min(1).max(160),
  content: z.string().min(1).max(1_000_000),
  summary: z.string().max(600).optional(),
  kind: z.enum(artifactKinds).optional().describe(kindFieldDescription),
  language: z.string().max(60).optional(),
  project: z.string().max(120).optional(),
  sessionId: z.string().max(200).optional(),
  source: z.string().max(120).optional().describe("Agent or harness name"),
  metadata: z.record(z.string(), z.unknown()).optional(),
};

/**
 * Runs a tool and returns its value as text. Errors written for the caller
 * (UserFacingError, zod and content validation) pass through; anything else
 * is logged and replaced, so database details never reach an agent.
 */
async function respond(run: () => Promise<unknown>) {
  try {
    const value = await run();
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    if (error instanceof UserFacingError || error instanceof ZodError) throw error;
    console.error("[mcp] Tool failed", error instanceof Error ? error.name : "unknown error");
    throw new Error("Something went wrong on the server. Try again.");
  }
}

/** Per-call context: the caller's teams, for slugs in and out. */
async function loadContext(userId: string) {
  const teams = await listTeamsForUser(userId);
  const view: McpViewContext = {
    viewerId: userId,
    teamSlugs: new Map(teams.map((team) => [team.id, team.slug])),
    urlFor: (publicId) => siteUrl(`/artifact/${publicId}`),
  };
  return { teams, view };
}

function teamBySlug(teams: TeamMembership[], slug: string) {
  const team = teams.find((item) => item.slug === slug.trim().toLowerCase());
  if (!team) throw new UserFacingError(`Team "${slug}" not found. Call teams_list for your teams.`);
  return team;
}

function scopeFor(teams: TeamMembership[], scope: string): ArtifactScope {
  if (scope === "mine") return { kind: "mine" };
  return { kind: "team", teamId: teamBySlug(teams, scope).id };
}

async function share(userId: string, artifact: ArtifactDto, teams: TeamMembership[], visibility: ArtifactVisibility, team: string | undefined) {
  const teamId = team ? teamBySlug(teams, team).id : null;
  return requestArtifactSharing({ requesterId: userId, artifactId: artifact.id, visibility, teamId, actor: "agent" });
}

/** Shares after a create or update. The artifact is already saved, so a sharing failure is reported, not thrown. */
async function shareAfterSave(userId: string, saved: ArtifactDto, teams: TeamMembership[], visibility: ArtifactVisibility | undefined, team: string | undefined) {
  if (!visibility) return { artifact: saved, sharing: null };
  try {
    const result = await share(userId, saved, teams, visibility, team);
    return { artifact: result.artifact, sharing: { status: result.status } };
  } catch (error) {
    const message = error instanceof UserFacingError ? error.message : "Sharing could not be changed.";
    return { artifact: saved, sharing: { status: "failed", error: message } };
  }
}

async function ownByPublicId(userId: string, publicId: string) {
  const record = await getOwnArtifactByPublicId(userId, publicId);
  if (!record) throw new UserFacingError("Artifact not found, or you are not its author.");
  return record;
}

function registerReadTools(server: McpServer, userId: string) {
  server.registerTool(
    "artifacts_list",
    {
      title: "List artifacts",
      description: "List and search artifacts by title, summary, content, or project. scope \"mine\" (default) lists yours; a team slug lists what is shared with that team.",
      inputSchema: {
        query: z.string().max(300).optional().describe("Text to find in artifacts"),
        project: z.string().max(120).optional().describe("Exact project name"),
        scope: z.string().max(39).optional().default("mine").describe("\"mine\" or a team slug from teams_list"),
        limit: z.number().int().min(1).max(100).optional().default(25),
      },
    },
    ({ query, project, scope, limit }) => respond(async () => {
      const { teams, view } = await loadContext(userId);
      const artifacts = await listArtifacts(userId, { scope: scopeFor(teams, scope), query, project, limit });
      return artifacts.map((item) => toMcpArtifact(item, view));
    }),
  );

  server.registerTool(
    "artifacts_get",
    {
      title: "Get artifact",
      description:
        "Retrieve a complete artifact you can read, by its id. `version` says whether you got the latest version or the approved version that readers outside the team see; `editPending` says whether newer changes wait for approval.",
      inputSchema: { id: publicIdField },
    },
    ({ id }) => respond(async () => {
      const viewable = await getViewableArtifact(id, userId);
      if (!viewable) throw new UserFacingError("Artifact not found.");
      const [[dto], { view }, files] = await Promise.all([toArtifactDtos([viewable.record]), loadContext(userId), filesForViewer(viewable)]);
      if (!dto) throw new UserFacingError("Artifact not found.");
      const served = { ...dto, ...viewable.view, files, updatedAt: viewable.view.updatedAt.toISOString() };
      return { ...toMcpArtifact(served, view), version: viewable.version.source, editPending: viewable.editPending };
    }),
  );

  server.registerTool(
    "teams_list",
    {
      title: "List teams",
      description: "List your teams with their slugs, your role, and whether sharing with the team needs approval.",
      inputSchema: {},
    },
    () => respond(async () => {
      const teams = await listTeamsForUser(userId);
      return teams.map((team) => ({ slug: team.slug, name: team.name, role: team.role, personal: team.personal, teamSharingNeedsApproval: team.teamSharingNeedsApproval }));
    }),
  );
}

function registerWriteTools(server: McpServer, userId: string) {
  server.registerTool(
    "artifacts_create",
    {
      title: "Create artifact",
      description: "Create an artifact to share context with future coding sessions and other agents. It is private unless you set visibility. Creation is limited per hour; a limit error says when to try again.",
      inputSchema: { ...editableFields, visibility: visibilityField, team: teamField },
    },
    ({ visibility, team, ...input }) => respond(async () => {
      const { teams, view } = await loadContext(userId);
      if (team) teamBySlug(teams, team);
      const created = await createArtifact(userId, input);
      const result = await shareAfterSave(userId, created, teams, visibility, team);
      return { artifact: toMcpArtifact(result.artifact, view), sharing: result.sharing };
    }),
  );

  server.registerTool(
    "artifacts_update",
    {
      title: "Update artifact",
      description:
        "Update your own artifact. Only supplied fields change. Setting visibility requests sharing through the team's rule. Edits to link or public artifacts shared through a team need an owner's or admin's approval: the edit saves for you and the team, `edit` is \"pending\", and readers outside the team keep seeing the last approved version until it is approved.",
      inputSchema: {
        id: publicIdField,
        ...editableFields,
        title: editableFields.title.optional(),
        content: editableFields.content.optional(),
        visibility: visibilityField,
        team: teamField,
      },
    },
    ({ id, visibility, team, ...input }) => respond(async () => {
      const { teams, view } = await loadContext(userId);
      const record = await ownByPublicId(userId, id);
      if (team) teamBySlug(teams, team);
      const updated = await updateArtifact(userId, record.id, input, "agent");
      if (!updated) throw new UserFacingError("Artifact not found, or you are not its author.");
      const result = await shareAfterSave(userId, updated, teams, visibility, team);
      return { artifact: toMcpArtifact(result.artifact, view), edit: updated.pendingEdit ? "pending" : "applied", sharing: result.sharing };
    }),
  );

  server.registerTool(
    "artifacts_delete",
    {
      title: "Delete artifact",
      description: "Permanently delete your own artifact by id.",
      inputSchema: { id: publicIdField },
    },
    ({ id }) => respond(async () => {
      const record = await ownByPublicId(userId, id);
      await deleteArtifact(userId, record.id);
      return { deleted: true, id };
    }),
  );
}

/**
 * Registers the artifact and team tools. Every read goes through the access
 * check (getViewableArtifact or listArtifacts). Writes are author-only, and
 * sharing goes through requestArtifactSharing as an agent, so it can wait for
 * approval but never approve.
 */
export function registerArtifactTools(server: McpServer, userId: string) {
  registerReadTools(server, userId);
  registerWriteTools(server, userId);
}
