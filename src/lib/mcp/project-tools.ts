import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError } from "zod";

import type { McpAccess } from "@/lib/oauth/scopes";
import { assertScopeAccess } from "@/lib/projects/manage";
import { listScopeProjects } from "@/lib/projects/queries";
import type { ProjectScope } from "@/lib/projects/rules";
import { getTeamForMember } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";

import { gateTools, type ToolServer } from "./tool-access";

/**
 * MCP tools for projects. Agents set an artifact's project by name on
 * artifacts_create and artifacts_update; these tools list what exists, so
 * agents reuse a project instead of inventing a near-duplicate.
 */

async function respond(run: () => Promise<unknown>) {
  try {
    const value = await run();
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    if (error instanceof UserFacingError || error instanceof ZodError) throw error;
    console.error("[mcp] Project tool failed", error instanceof Error ? error.name : "unknown error");
    throw new Error("Something went wrong on the server. Try again.");
  }
}

/** The project scope a tool call names: "mine", or a shared team the caller belongs to. */
export async function projectScopeFor(userId: string, scope: string): Promise<ProjectScope> {
  if (scope === "mine") return { kind: "user", userId };
  const team = await getTeamForMember(userId, scope.trim().toLowerCase());
  if (!team) throw new UserFacingError(`Team "${scope}" not found. Call teams_list for your teams.`);
  if (team.personal) throw new UserFacingError('Your personal team has no projects of its own. Use scope "mine".');
  return { kind: "team", teamId: team.id };
}

function registerReadTools(server: ToolServer, userId: string) {
  server.registerTool(
    "projects_list",
    {
      title: "List projects",
      description:
        'List projects with their icon and how many artifacts each holds. scope "mine" (default) lists the projects of your private artifacts; a team slug lists the projects of artifacts shared through that team. Reuse an existing name in artifacts_create and artifacts_update; a new name creates the project. Projects are for you and your team only: readers outside the team never see them.',
      inputSchema: {
        scope: z.string().max(39).optional().default("mine").describe('"mine" or a team slug from teams_list'),
      },
    },
    ({ scope }) => respond(async () => {
      const projectScope = await projectScopeFor(userId, scope);
      await assertScopeAccess(userId, projectScope);
      const projects = await listScopeProjects(projectScope);
      return projects.map(({ name, icon, count }) => ({ name, icon, count }));
    }),
  );
}

/** Registers the project tools. Every call checks that the caller may use the scope it names. */
export function registerProjectTools(server: McpServer, userId: string, access: McpAccess) {
  registerReadTools(gateTools(server, access), userId);
}
