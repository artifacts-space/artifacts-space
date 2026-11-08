import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError } from "zod";

import type { McpAccess } from "@/lib/oauth/scopes";
import { assertScopeAccess } from "@/lib/projects/manage";
import { tagLimits } from "@/lib/tags/limits";
import { scopeTags } from "@/lib/tags/queries";
import { checkTagChange, normalizeTag, type TagChange } from "@/lib/tags/rules";
import { setArtifactTags } from "@/lib/tags/store";
import { UserFacingError } from "@/lib/user-facing-error";

import { projectScopeFor } from "./project-tools";
import { gateTools, type ToolServer } from "./tool-access";

/**
 * Tags over MCP: the `tags` fields on artifacts_create, artifacts_update,
 * and artifacts_list, and tags_list, so agents reuse the tags a space
 * already uses instead of inventing near-duplicates.
 */

// Raw input is allowed some slack: tags are normalized and checked against the real limits after.
const rawTag = z.string().max(tagLimits.maxChars * 4);
const rawTags = z.array(rawTag).max(tagLimits.maxPerArtifact * 4);

/** `tags` on create and update: the whole set. */
export const tagsField = rawTags
  .optional()
  .describe(
    `Tags, the whole set (an update replaces them; [] removes all). Normalized: lowercase, spaces become "-", up to ${String(tagLimits.maxChars)} characters each and ${String(tagLimits.maxPerArtifact)} per artifact. Reuse what tags_list shows. Tags apply at once, file no version, never wait for approval, and readers outside the team never see them.`,
  );

/** artifacts_update's `addTags` and `removeTags`: change some tags and keep the rest. */
export const tagChangeFields = {
  addTags: rawTags.optional().describe("Tags to add, keeping the others. Not with `tags`."),
  removeTags: rawTags.optional().describe("Tags to remove, keeping the others. Not with `tags`."),
};

/** artifacts_list's `tags` filter. */
export const tagFilterField = rawTags.optional().describe("Only artifacts that carry every one of these tags");

/** The list filter for tags: normalized, empty ones dropped; undefined when none is left. */
export function tagFilterFor(tags: readonly string[] | undefined): string[] | undefined {
  const normalized = [...new Set((tags ?? []).map(normalizeTag).filter((tag) => tag.length > 0))];
  return normalized.length > 0 ? normalized : undefined;
}

/** The tag change an update asks for, checked before anything is saved; undefined when it sends no tag field. */
export function tagChangeFor(input: { tags?: string[] | undefined; addTags?: string[] | undefined; removeTags?: string[] | undefined }): TagChange | undefined {
  const { tags, addTags, removeTags } = input;
  const adjusting = addTags !== undefined || removeTags !== undefined;
  if (tags !== undefined && adjusting) throw new UserFacingError("Send `tags` to replace every tag, or `addTags` and `removeTags` to change some. Not both.");
  if (tags !== undefined) return checkTagChange({ set: tags });
  if (adjusting) return checkTagChange({ add: addTags ?? [], remove: removeTags ?? [] });
  return undefined;
}

/** Applies a tag change to an artifact the caller may edit and returns the new tags. */
export async function applyTagChangeFor(userId: string, artifactId: string, change: TagChange): Promise<string[]> {
  const tags = await setArtifactTags(userId, artifactId, change);
  if (tags === undefined) throw new UserFacingError("Artifact not found, or you cannot edit it.");
  return tags;
}

async function respond(run: () => Promise<unknown>) {
  try {
    const value = await run();
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    if (error instanceof UserFacingError || error instanceof ZodError) throw error;
    console.error("[mcp] Tag tool failed", error instanceof Error ? error.name : "unknown error");
    throw new Error("Something went wrong on the server. Try again.");
  }
}

function registerReadTools(server: ToolServer, userId: string) {
  server.registerTool(
    "tags_list",
    {
      title: "List tags",
      description:
        'List the tags in use, most used first, with how many artifacts carry each. scope "mine" (default) lists the tags of your private artifacts; a team slug lists the tags of artifacts shared through that team. Reuse these in artifacts_create and artifacts_update. Tags are for you and your team only: readers outside the team never see them.',
      inputSchema: {
        scope: z.string().max(39).optional().default("mine").describe('"mine" or a team slug from teams_list'),
      },
    },
    ({ scope }) => respond(async () => {
      const tagScope = await projectScopeFor(userId, scope);
      await assertScopeAccess(userId, tagScope);
      return scopeTags(tagScope);
    }),
  );
}

/** Registers the tag tools. Every call checks that the caller may use the scope it names. */
export function registerTagTools(server: McpServer, userId: string, access: McpAccess) {
  registerReadTools(gateTools(server, access), userId);
}
