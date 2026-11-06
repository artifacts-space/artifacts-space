/**
 * The name agents and setup snippets use for an artifacts.space access
 * token, for example in a shell profile or an `.env` file.
 */
export const TOKEN_ENV_VAR = "ARTIFACTS_SPACE_TOKEN";

/** The server name every MCP snippet registers. */
export const MCP_SERVER_NAME = "artifacts";

/** Stands in for a real token in snippets shown before a token exists. */
export const TOKEN_PLACEHOLDER = "YOUR_TOKEN";

/** The MCP endpoint on a site origin, such as "https://artifacts.space". */
export function mcpEndpoint(origin: string): string {
  return new URL("/api/mcp", origin).href;
}

/**
 * The `mcp.json` server entry for any MCP client, pretty-printed. Pass a
 * token to get a snippet that is ready to paste; leave it out for a
 * placeholder.
 */
export function mcpConfigJson(origin: string, token: string = TOKEN_PLACEHOLDER): string {
  const config = {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        url: mcpEndpoint(origin),
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  };
  return JSON.stringify(config, null, 2);
}

/** The Claude Code one-liner that adds the same server as `mcpConfigJson`. */
export function claudeMcpAddCommand(origin: string, token: string = TOKEN_PLACEHOLDER): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME} ${mcpEndpoint(origin)} --header "Authorization: Bearer ${token}"`;
}
