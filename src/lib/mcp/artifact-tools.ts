import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError } from "zod";

import { getEditableArtifact } from "@/lib/access";
import { ICON_FIELD_DESCRIPTION, isAcceptedIconInput, ICON_RULE_MESSAGE } from "@/lib/artifact-icons";
import { artifactIconLimits } from "@/lib/artifact-icon-limits";
import { loadArtifactForViewer } from "@/lib/artifact-read";
import { artifactKinds, artifactVisibilities, commentSettings, type ArtifactDto, type ArtifactVisibility, type CommentSetting } from "@/lib/artifact-types";
import {
  createArtifact,
  deleteArtifact,
  getEditableArtifactDto,
  getOwnArtifactByPublicId,
  listArtifacts,
  updateArtifact,
  type ArtifactScope,
  type ArtifactUpdateInput,
} from "@/lib/artifacts";
import { kindFieldDescription } from "@/lib/mcp/format-tools";
import { projectLimits } from "@/lib/projects/limits";
import { projectChoiceSchema, projectNameKey } from "@/lib/projects/rules";
import { setArtifactProject } from "@/lib/projects/store";
import { isPublicId } from "@/lib/public-id";
import { setArtifactComments } from "@/lib/sharing/comments";
import { requestArtifactSharing } from "@/lib/sharing/service";
import { siteUrl } from "@/lib/site-origin";
import { listTeamsForUser, type TeamMembership } from "@/lib/teams/queries";
import { artifactThemeRawSchema, parseArtifactThemeInput, THEME_FIELD_DESCRIPTION } from "@/lib/themes/artifact-theme";
import type { McpAccess } from "@/lib/oauth/scopes";
import { UserFacingError } from "@/lib/user-facing-error";

import { toMcpArtifact, toMcpListItem, type McpViewContext } from "./artifact-view";
import { gateTools, type ToolServer } from "./tool-access";

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

const commentsField = z
  .enum(commentSettings)
  .optional()
  .describe(
    "Who can read and write its comments. off: nobody (existing comments are hidden, not deleted). team: the author and members of its team. signed_in: anyone signed in who can read it. Left out on a sharing change: kept within the same team, else off for link or public in a personal team and team in a shared team. signed_in in a shared team waits for an owner's or admin's approval.",
  );

const iconField = z
  .string()
  .max(artifactIconLimits.maxInputLength, ICON_RULE_MESSAGE)
  .nullable()
  .refine(isAcceptedIconInput, ICON_RULE_MESSAGE)
  .optional()
  .describe(ICON_FIELD_DESCRIPTION);

const themeField = artifactThemeRawSchema.optional().describe(THEME_FIELD_DESCRIPTION);

/** Checks `theme` before anything is saved, so an agent gets every problem and the nearest passing colors in one clear message. */
function assertTheme(theme: unknown) {
  if (theme === undefined) return;
  const result = parseArtifactThemeInput(theme);
  if (!result.ok) throw new UserFacingError(result.message);
}

const projectField = z
  .string()
  .max(projectLimits.maxNameChars * 2)
  .nullable()
  .optional()
  .describe(
    "Project name, matched without regard to case among the artifact's projects (projects_list shows them); a new name creates the project. null or \"\" removes it. Your private artifacts use your projects; artifacts shared through a team use the team's. Moving an artifact between projects never files a version or waits for approval, and readers outside the team never see it.",
  );

const editableFields = {
  title: z.string().min(1).max(160),
  icon: iconField,
  theme: themeField,
  content: z.string().min(1).max(1_000_000),
  summary: z.string().max(600).optional(),
  kind: z.enum(artifactKinds).optional().describe(kindFieldDescription),
  language: z.string().max(60).optional(),
  project: projectField,
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

/** Who can read it and who can comment, as a create or update asks for them. */
interface SharingAsk {
  visibility: ArtifactVisibility | undefined;
  team: string | undefined;
  comments: CommentSetting | undefined;
}

type ChangeStatus = { status: "applied" | "pending" } | { status: "failed"; error: string };

function failed(error: unknown, fallback: string): ChangeStatus {
  return { status: "failed", error: error instanceof UserFacingError ? error.message : fallback };
}

/** A sharing change that carries the comments setting. Only the author shares. */
async function shareWithComments(userId: string, saved: ArtifactDto, teams: TeamMembership[], ask: SharingAsk & { visibility: ArtifactVisibility }) {
  try {
    const teamId = ask.team ? teamBySlug(teams, ask.team).id : null;
    const result = await requestArtifactSharing({ requesterId: userId, artifactId: saved.id, visibility: ask.visibility, teamId, comments: ask.comments, actor: "agent" });
    const comments: ChangeStatus | null = ask.comments ? { status: result.comments } : null;
    return { artifact: result.artifact, sharing: { status: result.status } satisfies ChangeStatus, comments };
  } catch (error) {
    return { artifact: saved, sharing: failed(error, "Sharing could not be changed."), comments: null };
  }
}

/** A comments setting change on its own: the author, or an owner or admin of its team. */
async function changeComments(userId: string, saved: ArtifactDto, comments: CommentSetting) {
  try {
    const result = await setArtifactComments({ actorId: userId, artifactId: saved.id, comments, actor: "agent" });
    return { artifact: result.artifact, sharing: null, comments: { status: result.status } satisfies ChangeStatus };
  } catch (error) {
    return { artifact: saved, sharing: null, comments: failed(error, "Comments could not be changed.") };
  }
}

/**
 * Shares and sets comments after a create or update. The artifact is already
 * saved, so a failure is reported in the result, not thrown.
 */
async function shareAfterSave(userId: string, saved: ArtifactDto, teams: TeamMembership[], ask: SharingAsk) {
  const { visibility } = ask;
  if (visibility) return shareWithComments(userId, saved, teams, { ...ask, visibility });
  if (ask.comments) return changeComments(userId, saved, ask.comments);
  return { artifact: saved, sharing: null, comments: null };
}

async function ownByPublicId(userId: string, publicId: string) {
  const record = await getOwnArtifactByPublicId(userId, publicId);
  if (!record) throw new UserFacingError("Artifact not found, or you are not its author.");
  return record;
}

/** An artifact the caller may edit: their own, or one shared through their team. */
async function editableByPublicId(userId: string, publicId: string) {
  const record = await getEditableArtifact(userId, { publicId });
  if (!record) throw new UserFacingError("Artifact not found, or you cannot edit it. You can edit your own artifacts and those shared through your team.");
  return record;
}

/** The list filter for a project name, or none. */
function projectFilterFor(name: string | undefined) {
  const key = name ? projectNameKey(name) : "";
  return key ? { key } : undefined;
}

/** Moves the artifact into the named project, or out of every project for null or "". */
async function moveToProject(userId: string, artifactId: string, name: string | null) {
  const choice = projectChoiceSchema.parse(name);
  const moved = await setArtifactProject(userId, artifactId, choice ? { name: choice } : { none: true });
  if (moved === undefined) throw new UserFacingError("Artifact not found, or you cannot edit it.");
  return moved;
}

/**
 * Saves the content and fields an update supplied, filing a version. When it
 * supplied none (only project, sharing, or comments), nothing is saved and
 * no version is filed.
 */
async function saveFields(userId: string, artifactId: string, input: ArtifactUpdateInput): Promise<{ artifact: ArtifactDto; edit: "applied" | "pending" | "unchanged" }> {
  if (!Object.values(input).some((value) => value !== undefined)) {
    const current = await getEditableArtifactDto(userId, artifactId);
    if (!current) throw new UserFacingError("Artifact not found, or you cannot edit it.");
    return { artifact: current, edit: "unchanged" };
  }
  const updated = await updateArtifact(userId, artifactId, input, "agent");
  if (!updated) throw new UserFacingError("Artifact not found, or you cannot edit it.");
  return { artifact: updated, edit: updated.pendingEdit ? "pending" : "applied" };
}

function registerReadTools(server: ToolServer, userId: string) {
  server.registerTool(
    "artifacts_list",
    {
      title: "List artifacts",
      description:
        "List and search artifacts by title, summary, content, or project name, or only those in one `project`. scope \"mine\" (default) lists yours; a team slug lists what is shared with that team. Items have no content: text formats carry a short `preview` (the first 280 characters), others none. Call artifacts_get with an id to read the full content.",
      inputSchema: {
        query: z.string().max(300).optional().describe("Text to find in artifacts"),
        project: z.string().max(projectLimits.maxNameChars * 2).optional().describe("Only artifacts in this project (name, any case)"),
        scope: z.string().max(39).optional().default("mine").describe("\"mine\" or a team slug from teams_list"),
        limit: z.number().int().min(1).max(100).optional().default(25),
      },
    },
    ({ query, project, scope, limit }) => respond(async () => {
      const { teams, view } = await loadContext(userId);
      const artifacts = await listArtifacts(userId, { scope: scopeFor(teams, scope), query, project: projectFilterFor(project), limit });
      return artifacts.map((item) => toMcpListItem(item, view));
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
      const [loaded, { view }] = await Promise.all([loadArtifactForViewer(id, userId), loadContext(userId)]);
      if (!loaded) throw new UserFacingError("Artifact not found.");
      return { ...toMcpArtifact(loaded.dto, view), version: loaded.viewable.version.source, editPending: loaded.viewable.editPending };
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

function registerWriteTools(server: ToolServer, userId: string) {
  server.registerTool(
    "artifacts_create",
    {
      title: "Create artifact",
      description:
        "Create an artifact to share context with future coding sessions and other agents. It is private unless you set visibility, and `comments` sets who can comment. Creation is limited per hour; a limit error says when to try again.",
      inputSchema: { ...editableFields, visibility: visibilityField, team: teamField, comments: commentsField },
    },
    ({ visibility, team, comments, ...input }) => respond(async () => {
      const { teams, view } = await loadContext(userId);
      if (team) teamBySlug(teams, team);
      assertTheme(input.theme);
      const created = await createArtifact(userId, input);
      const result = await shareAfterSave(userId, created, teams, { visibility, team, comments });
      return { artifact: toMcpArtifact(result.artifact, view), sharing: result.sharing, comments: result.comments };
    }),
  );

  server.registerTool(
    "artifacts_update",
    {
      title: "Update artifact",
      description:
        "Update an artifact you can edit: your own, or one shared through your team (team, link, or public). Only supplied fields change, and every save is kept in the history (artifacts_versions). `project` applies at once, files no version, and never waits for approval; when you send only `project`, sharing, or comments, `edit` is \"unchanged\". Only the author can set visibility, which requests sharing through the team's rule. The author (and the team's owners and admins) can set `comments`. Edits to link or public artifacts shared through a team need an owner's or admin's approval: the edit saves for you and the team, `edit` is \"pending\", and readers outside the team keep seeing the last approved version until it is approved. Edits are limited per hour (generously); a limit error says when to try again.",
      inputSchema: {
        id: publicIdField,
        ...editableFields,
        title: editableFields.title.optional(),
        content: editableFields.content.optional(),
        visibility: visibilityField,
        team: teamField,
        comments: commentsField,
      },
    },
    ({ id, visibility, team, comments, project, ...input }) => respond(async () => {
      const { teams, view } = await loadContext(userId);
      const record = await editableByPublicId(userId, id);
      if (team) teamBySlug(teams, team);
      assertTheme(input.theme);
      const saved = await saveFields(userId, record.id, input);
      // The project changes after the save, on its own: no version, no approval, and nothing if the save failed.
      const artifact = project === undefined ? saved.artifact : { ...saved.artifact, project: await moveToProject(userId, record.id, project) };
      const result = await shareAfterSave(userId, artifact, teams, { visibility, team, comments });
      return { artifact: toMcpArtifact(result.artifact, view), edit: saved.edit, sharing: result.sharing, comments: result.comments };
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
 * check (getViewableArtifact or listArtifacts). Updates go through the edit
 * check (getEditableArtifact); deleting and sharing are author-only, and
 * sharing goes through requestArtifactSharing as an agent, so it can wait for
 * approval but never approve. Write tools are left out for read-only access.
 */
export function registerArtifactTools(server: McpServer, userId: string, access: McpAccess) {
  const gated = gateTools(server, access);
  registerReadTools(gated, userId);
  registerWriteTools(gated, userId);
}
