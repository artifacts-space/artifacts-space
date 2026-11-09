/** One MCP connection: a person's approved OAuth app, or one API token. Server-side only. */
export type McpConnectionRef =
  | { kind: "oauth"; userId: string; clientId: string }
  | { kind: "api-token"; userId: string; tokenId: string };
