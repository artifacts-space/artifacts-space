import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError } from "zod";

import { getEditableArtifact } from "@/lib/access";
import { findDeletableArtifact } from "@/lib/agents/owner-access";
import { ICON_FIELD_DESCRIPTION, isAcceptedIconInput, ICON_RULE_MESSAGE } from "@/lib/artifact-icons";
import { artifactIconLimits } from "@/lib/artifact-icon-limits";
import { loadArtifactForViewer } from "@/lib/artifact-read";
import { artifactKinds, artifactVisibilities, commentSettings, type ArtifactDto, type ArtifactVisibility, type CommentSetting } from "@/lib/artifact-types";
import {
  createArtifact,
  deleteArtifact,
  getEditableArtifactDto,
  listArtifacts,
  updateArtifact,
  type ArtifactScope,
  type ArtifactUpdateInput,
} from "@/lib/artifacts";
import { kindFieldDescription } from "@/lib/mcp/format-tools";
import { projectLimits } from "@/lib/projects/limits";
import { setArtifactFullWidth } from "@/lib/page-width/store";
import { projectChoiceSchema, projectNameKey } from "@/lib/projects/rules";
import { setArtifactProject } from "@/lib/projects/store";
import type { TagChange } from "@/lib/tags/rules";
import { isPublicId } from "@/lib/public-id";
import { setArtifactComments } from "@/lib/sharing/comments";
import { requestArtifactSharing } from "@/lib/sharing/service";
import { siteUrl } from "@/lib/site-origin";
import { listTeamsForUser, type TeamMembership } from "@/lib/teams/queries";
import { COVER_FIELD_DESCRIPTION, COVER_POSITION_DESCRIPTION, COVER_RULE_MESSAGE, resolveCoverChange } from "@/lib/covers/cover";
import { artifactCoverLimits } from "@/lib/covers/limits";
import { artifactThemeRawSchema, parseArtifactThemeInput, THEME_FIELD_DESCRIPTION } from "@/lib/themes/artifact-theme";
import type { McpAccess } from "@/lib/oauth/scopes";
import { EditConflictError } from "@/lib/edits/conflict-error";
import { UserFacingError } from "@/lib/user-facing-error";

import { toMcpArtifact, toMcpListItem, type McpViewContext } from "./artifact-view";
import { asSaved, baseVersionField, baseVersionOf, editConflictResult } from "./edit-conflict-tools";
import { noHarness, type HarnessSource } from "./harness-context";
import { applyTagChangeFor, tagChangeFields, tagChangeFor, tagFilterField, tagFilterFor, tagsField } from "./tag-tools";
import { artifactToolCopy } from "./routing-copy";
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
  .describe("Team slug from teams_list. For team sharing, the team to share with; for link or public, the team whose admins approve it. Left out: the team the artifact is already shared through, else your personal team, else your only team.");

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

const coverField = z.string().max(artifactCoverLimits.maxInputLength, COVER_RULE_MESSAGE).nullable().optional().describe(COVER_FIELD_DESCRIPTION);
const coverPositionField = z.number().int().min(0).max(100).optional().describe(COVER_POSITION_DESCRIPTION);

/** The stored cover from an agent's `cover` and `coverPosition`, checked before anything is saved. Undefined keeps the current one. */
function coverFor(cover: string | null | undefined, position: number | undefined, current: string | null) {
  const change = resolveCoverChange(cover, position, current);
  if (!change.ok) throw new UserFacingError(change.message);
  return change.cover;
}

const projectField = z
  .string()
  .max(projectLimits.maxNameChars * 2)
  .nullable()
  .optional()
  .describe(
    "Project name, matched without regard to case among the artifact's projects (projects_list shows them); a new name creates the project. null or \"\" removes it. Your private artifacts use your projects; artifacts shared through a team use the team's. Moving an artifact between projects never files a version or waits for approval, and readers outside the team never see it.",
  );

const fullWidthField = z
  .boolean()
  .optional()
  .describe("Show the page full width (true) or at the reading width (false, the default), like Notion's Full width. A display setting: applies at once, files no version, and never waits for approval.");

const editableFields = {
  title: z.string().min(1).max(160),
  icon: iconField,
  theme: themeField,
  cover: coverField,
  coverPosition: coverPositionField,
  content: z.string().min(1).max(1_000_000),
  summary: z.string().max(600).optional(),
  kind: z.enum(artifactKinds).optional().describe(kindFieldDescription),
  language: z.string().max(60).optional(),
  project: projectField,
  tags: tagsField,
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
    // A refused save is a typed tool error: what changed, and to read it again before saving.
    if (error instanceof EditConflictError) return editConflictResult(error);
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

/** A sharing change that carries the comments setting. Only the author, or the person who added the agent that wrote it, shares. */
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

/** Applies an update's project and tag changes after its save, returning the artifact as it now is. */
async function organize(userId: string, artifactId: string, saved: ArtifactDto, project: string | null | undefined, tagChange: TagChange | undefined): Promise<ArtifactDto> {
  const moved = project === undefined ? saved : { ...saved, project: await moveToProject(userId, artifactId, project) };
  return tagChange ? { ...moved, tags: await applyTagChangeFor(userId, artifactId, tagChange) } : moved;
}

/** Applies an update's full width setting after its save. Undefined leaves it as it is. */
async function applyFullWidth(userId: string, artifactId: string, artifact: ArtifactDto, fullWidth: boolean | undefined): Promise<ArtifactDto> {
  if (fullWidth === undefined) return artifact;
  const saved = await setArtifactFullWidth(userId, artifactId, fullWidth);
  if (!saved) throw new UserFacingError("Artifact not found, or you cannot edit it.");
  return { ...artifact, fullWidth: saved.fullWidth };
}

/**
 * Saves the content and fields an update supplied, filing a version. When it
 * supplied none (only project, tags, full width, sharing, or comments), nothing is saved and
 * no version is filed.
 */
async function saveFields(userId: string, artifactId: string, input: ArtifactUpdateInput, harness: HarnessSource, baseVersion: string | undefined): Promise<{ artifact: ArtifactDto; edit: "applied" | "pending" | "unchanged" }> {
  if (!Object.values(input).some((value) => value !== undefined)) {
    const current = await getEditableArtifactDto(userId, artifactId);
    if (!current) throw new UserFacingError("Artifact not found, or you cannot edit it.");
    return { artifact: current, edit: "unchanged" };
  }
  // A refused save (stale baseVersion, or a person typing) throws EditConflictError before anything after it runs.
  const updated = await updateArtifact(userId, artifactId, input, "agent", { harness: await harness(), baseVersion });
  if (!updated) throw new UserFacingError("Artifact not found, or you cannot edit it.");
  return { artifact: updated, edit: updated.pendingEdit ? "pending" : "applied" };
}

function registerReadTools(server: ToolServer, userId: string) {
  server.registerTool(
    "artifacts_list",
    {
      ...artifactToolCopy.artifacts_list,
      inputSchema: {
        query: z.string().max(300).optional().describe("Text to find in artifacts"),
        project: z.string().max(projectLimits.maxNameChars * 2).optional().describe("Only artifacts in this project (name, any case)"),
        tags: tagFilterField,
        scope: z.string().max(39).optional().default("mine").describe("\"mine\" or a team slug from teams_list"),
        limit: z.number().int().min(1).max(100).optional().default(25),
      },
    },
    ({ query, project, tags, scope, limit }) => respond(async () => {
      const { teams, view } = await loadContext(userId);
      const artifacts = await listArtifacts(userId, { scope: scopeFor(teams, scope), query, project: projectFilterFor(project), tags: tagFilterFor(tags), limit });
      return artifacts.map((item) => toMcpListItem(item, view));
    }),
  );

  server.registerTool(
    "artifacts_get",
    {
      ...artifactToolCopy.artifacts_get,
      inputSchema: { id: publicIdField },
    },
    ({ id }) => respond(async () => {
      const [loaded, { view }] = await Promise.all([loadArtifactForViewer(id, userId), loadContext(userId)]);
      if (!loaded) throw new UserFacingError("Artifact not found.");
      // A connection that cannot edit a CSV whose owner turned downloads off gets it without its content.
      const read = { ...toMcpArtifact(loaded.dto, view, { canEdit: loaded.viewable.canEdit }), version: loaded.viewable.version.source, editPending: loaded.viewable.editPending };
      // Editors read the latest version: they get its id and the baseVersion to send back with an update.
      if (!loaded.viewable.canEdit || loaded.viewable.version.source !== "latest") return read;
      return { ...read, ...(await baseVersionOf(loaded.dto.id, loaded.dto.updatedAt)) };
    }),
  );

  server.registerTool(
    "teams_list",
    {
      ...artifactToolCopy.teams_list,
      inputSchema: {},
    },
    () => respond(async () => {
      const teams = await listTeamsForUser(userId);
      return teams.map((team) => ({ slug: team.slug, name: team.name, role: team.role, personal: team.personal, teamSharingNeedsApproval: team.teamSharingNeedsApproval }));
    }),
  );
}

function registerWriteTools(server: ToolServer, userId: string, harness: HarnessSource) {
  server.registerTool(
    "artifacts_create",
    {
      ...artifactToolCopy.artifacts_create,
      inputSchema: { ...editableFields, visibility: visibilityField, team: teamField, comments: commentsField },
    },
    ({ visibility, team, comments, cover, coverPosition, ...input }) => respond(async () => {
      const { teams, view } = await loadContext(userId);
      if (team) teamBySlug(teams, team);
      assertTheme(input.theme);
      const created = await createArtifact(userId, { ...input, cover: coverFor(cover, coverPosition, null) }, { harness: await harness(), actor: "agent" });
      const result = await shareAfterSave(userId, created, teams, { visibility, team, comments });
      // What the agent created, with the token of that save, even if someone saved since (asSaved).
      const artifact = { ...toMcpArtifact(asSaved(result.artifact, created), view, { canEdit: true }), ...(await baseVersionOf(created.id, created.updatedAt)) };
      return { artifact, sharing: result.sharing, comments: result.comments };
    }),
  );

  server.registerTool(
    "artifacts_update",
    {
      ...artifactToolCopy.artifacts_update,
      inputSchema: {
        id: publicIdField,
        ...editableFields,
        title: editableFields.title.optional(),
        content: editableFields.content.optional(),
        ...tagChangeFields,
        fullWidth: fullWidthField,
        visibility: visibilityField,
        team: teamField,
        comments: commentsField,
        baseVersion: baseVersionField,
      },
    },
    ({ id, visibility, team, comments, project, tags, addTags, removeTags, fullWidth, cover, coverPosition, baseVersion, ...input }) => respond(async () => {
      const { teams, view } = await loadContext(userId);
      const record = await editableByPublicId(userId, id);
      if (team) teamBySlug(teams, team);
      assertTheme(input.theme);
      const tagChange = tagChangeFor({ tags, addTags, removeTags });
      const saved = await saveFields(userId, record.id, { ...input, cover: coverFor(cover, coverPosition, record.cover) }, harness, baseVersion);
      // Project, tags, and full width change after the save, on their own: no version, no approval, and nothing if the save failed.
      const organized = await organize(userId, record.id, saved.artifact, project, tagChange);
      const artifact = await applyFullWidth(userId, record.id, organized, fullWidth);
      const result = await shareAfterSave(userId, artifact, teams, { visibility, team, comments });
      // The agent's own save and its baseVersion, for its next update: never a later read that names a save it never saw (asSaved).
      const current = { ...toMcpArtifact(asSaved(result.artifact, saved.artifact), view, { canEdit: true }), ...(await baseVersionOf(record.id, saved.artifact.updatedAt)) };
      return { artifact: current, edit: saved.edit, sharing: result.sharing, comments: result.comments };
    }),
  );

  server.registerTool(
    "artifacts_delete",
    {
      ...artifactToolCopy.artifacts_delete,
      inputSchema: { id: publicIdField },
    },
    ({ id }) => respond(async () => {
      const record = await findDeletableArtifact(userId, { publicId: id });
      if (!record) throw new UserFacingError("Artifact not found, or you cannot delete it. You can delete your own artifacts and those of agents you added.");
      await deleteArtifact(userId, record.id);
      return { deleted: true, id };
    }),
  );
}

/**
 * Registers the artifact and team tools. Every read goes through the access
 * check (getViewableArtifact or listArtifacts). Updates go through the edit
 * check (getEditableArtifact); deleting and sharing are for the author or
 * the person who added the agent that wrote it, and
 * sharing goes through requestArtifactSharing as an agent, so it can wait for
 * approval but never approve. Write tools are left out for read-only access.
 * Creates and updates stamp the connection's agent harness (`harness`).
 */
export function registerArtifactTools(server: McpServer, userId: string, access: McpAccess, harness: HarnessSource = noHarness) {
  const gated = gateTools(server, access);
  registerReadTools(gated, userId);
  registerWriteTools(gated, userId, harness);
}
