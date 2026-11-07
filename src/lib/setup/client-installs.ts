import { MCP_SERVER_NAME, mcpEndpoint, TOKEN_ENV_VAR } from "./mcp-config";

/**
 * Install links and setup snippets for each MCP client. Every snippet is a
 * remote Streamable HTTP server with the endpoint URL only: the client finds
 * the sign-in server from the endpoint, so there is no token and nothing runs
 * on the user's machine. Pure functions, safe on the server and the client.
 */

/** The remote server entry every OAuth-capable client takes: the URL and nothing else. */
export interface RemoteServerConfig {
  url: string;
}

/** The server entry for `origin`, as Cursor's install link and `mcp.json` expect it. */
export function remoteServerConfig(origin: string): RemoteServerConfig {
  return { url: mcpEndpoint(origin) };
}

/** Base64 of an ASCII string. The config holds only a URL, which `URL.href` keeps ASCII. */
function toBase64(text: string): string {
  return btoa(text);
}

/**
 * The Cursor one-click install link. Cursor's documented format is
 * `cursor://anysphere.cursor-deeplink/mcp/install?name=$NAME&config=$BASE64_ENCODED_CONFIG`,
 * where the config is the server entry from `mcp.json`, JSON-stringified,
 * then base64-encoded. Both values are also percent-encoded, so a `+` or `/`
 * in the base64 survives query parsing.
 * Source: https://cursor.com/docs/context/mcp/install-links
 */
export function cursorInstallLink(origin: string): string {
  const config = toBase64(JSON.stringify(remoteServerConfig(origin)));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(MCP_SERVER_NAME)}&config=${encodeURIComponent(config)}`;
}

/**
 * The Codex command that adds the server. `codex mcp add <NAME> --url <URL>`
 * adds a Streamable HTTP server, then starts the OAuth sign-in when the
 * server supports it.
 * Source: https://github.com/openai/codex/blob/main/codex-rs/cli/src/mcp_cmd.rs
 */
export function codexMcpAddCommand(origin: string): string {
  return `codex mcp add ${MCP_SERVER_NAME} --url ${mcpEndpoint(origin)}`;
}

/**
 * The Codex sign-in command, for a server added through `config.toml`.
 * Source: https://learn.chatgpt.com/docs/extend/mcp?surface=cli
 */
export function codexMcpLoginCommand(): string {
  return `codex mcp login ${MCP_SERVER_NAME}`;
}

/**
 * The `~/.codex/config.toml` entry. The ChatGPT desktop app, the Codex CLI,
 * and the IDE extension share this file.
 * Source: https://learn.chatgpt.com/docs/extend/mcp?surface=cli
 */
export function codexConfigToml(origin: string): string {
  return `[mcp_servers.${MCP_SERVER_NAME}]\nurl = ${JSON.stringify(mcpEndpoint(origin))}`;
}

/**
 * The `config.toml` entry for headless Codex: the token comes from an
 * environment variable, never from the file.
 * Source: https://learn.chatgpt.com/docs/extend/mcp?surface=cli
 */
export function codexHeadlessConfigToml(origin: string): string {
  return `${codexConfigToml(origin)}\nbearer_token_env_var = ${JSON.stringify(TOKEN_ENV_VAR)}`;
}

/** The OpenCode `opencode.json` entry for a remote server. */
export function opencodeConfigJson(origin: string): string {
  const config = { $schema: "https://opencode.ai/config.json", mcp: { [MCP_SERVER_NAME]: { type: "remote", url: mcpEndpoint(origin) } } };
  return JSON.stringify(config, null, 2);
}

/** The clients the docs give setup steps for, in picker order. */
export const mcpClients = [
  { id: "claude-code", label: "Claude Code", oneClick: false },
  { id: "cursor", label: "Cursor", oneClick: true },
  { id: "claude-desktop", label: "Claude Desktop", oneClick: false },
  { id: "codex", label: "Codex", oneClick: false },
  { id: "devin", label: "Devin", oneClick: false },
  { id: "other-clients", label: "Other clients", oneClick: false },
] as const;

/** The id of a client in `mcpClients`, also its heading anchor on the clients page. */
export type McpClientId = (typeof mcpClients)[number]["id"];
