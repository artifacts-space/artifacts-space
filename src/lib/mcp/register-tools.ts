import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { McpAccess } from "@/lib/oauth/scopes";

import { noHarness, type HarnessSource } from "./harness-context";

import { registerArtifactTools } from "./artifact-tools";
import { registerFileTools } from "./file-tools";
import { registerFormatTools } from "./format-tools";
import { registerProjectTools } from "./project-tools";
import { registerTagTools } from "./tag-tools";
import { registerTeamTools } from "./team-tools";
import { registerThemeTools } from "./theme-tools";
import { registerVersionTools } from "./version-tools";
import { registerViewTools } from "./view-tools";

/**
 * Registers every MCP tool for one connection, in the order `tools/list`
 * returns them. The MCP route and the tests that check the whole list (the
 * always-load test and the routing eval's tool snapshot) all call this, so a
 * new tool reaches each of them. Write tools are left out for read-only
 * access by each registration. `harness` is the connection's agent harness,
 * stamped on the saves the artifact, file, and version tools make.
 */
export function registerAllTools(server: McpServer, userId: string, access: McpAccess, harness: HarnessSource = noHarness) {
  registerArtifactTools(server, userId, access, harness);
  registerProjectTools(server, userId, access);
  registerTagTools(server, userId, access);
  registerFormatTools(server, access);
  registerThemeTools(server, userId, access);
  registerFileTools(server, userId, access, harness);
  registerTeamTools(server, userId, access);
  registerVersionTools(server, userId, access, harness);
  registerViewTools(server, userId, access);
}
