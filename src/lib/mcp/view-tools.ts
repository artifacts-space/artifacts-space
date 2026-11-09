import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError } from "zod";

import { getEditableArtifact } from "@/lib/access";
import type { McpAccess } from "@/lib/oauth/scopes";
import { isPublicId } from "@/lib/public-id";
import { UserFacingError } from "@/lib/user-facing-error";
import { canSeeViews } from "@/lib/views/view-access";
import { loadViewStats } from "@/lib/views/view-stats";
import { viewRangeSchema } from "@/lib/views/view-stats-rules";

import { gateTools, type ToolServer } from "./tool-access";

/**
 * The MCP read tool for an artifact's view counts. Like the Views dialog, it
 * answers only callers who may edit the artifact (its author, or a member of
 * the team it is shared through), through getEditableArtifact.
 */

const publicIdField = z.string().refine(isPublicId, "Use the artifact's 22-character id.").describe("Artifact id (22 characters)");

async function respond(run: () => Promise<unknown>) {
  try {
    const value = await run();
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    if (error instanceof UserFacingError || error instanceof ZodError) throw error;
    console.error("[mcp] View tool failed", error instanceof Error ? error.name : "unknown error");
    throw new Error("Something went wrong on the server. Try again.");
  }
}

function registerReadTools(server: ToolServer, userId: string) {
  server.registerTool(
    "artifacts_views",
    {
      title: "Artifact views",
      description:
        "How many people read an artifact you can edit while it was public: total views and daily unique visitors over the last 30 or 90 days (UTC), views per day, and the top referring domains. Views are counted without cookies; the author and team are never counted, nor are bots. Link, team, and private artifacts are not counted (`counting` is false).",
      inputSchema: {
        id: publicIdField,
        days: viewRangeSchema.optional().default(30).describe("30 or 90"),
      },
    },
    ({ id, days }) => respond(async () => {
      const record = await getEditableArtifact(userId, { publicId: id });
      if (!record || !(await canSeeViews(userId, record))) throw new UserFacingError("Artifact not found, or you cannot see its views. Only people and agents who can edit an artifact, and whose team role may see views, see them.");
      return { id, ...(await loadViewStats(record, days)) };
    }),
  );
}

/** Registers the view tools. All of them only read. */
export function registerViewTools(server: McpServer, userId: string, access: McpAccess) {
  registerReadTools(gateTools(server, access), userId);
}
