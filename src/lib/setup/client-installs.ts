import { SKILLS_REPO } from "./install-command";
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
 * The name Claude shows for the connector. The link below puts it in the
 * form, and the person can change it there.
 */
export const CLAUDE_CONNECTOR_NAME = "artifacts.space";

/**
 * The Claude install link. It opens claude.ai's "Add custom connector" form
 * with the name and the server URL filled in; the person checks them and
 * adds the connector. Connectors live in the Claude account, so one added
 * here shows in Claude Desktop, on claude.ai, and in the phone apps.
 * Source: https://claude.com/docs/connectors/building/directory-vs-custom
 */
export function claudeInstallLink(origin: string): string {
  return `https://claude.ai/customize/connectors?${claudeConnectorQuery(origin)}`;
}

/**
 * The same link for a Claude Team or Enterprise owner: it opens the form
 * that adds the connector for the whole organization.
 * Source: https://claude.com/docs/connectors/building/directory-vs-custom
 */
export function claudeTeamInstallLink(origin: string): string {
  return `https://claude.ai/admin-settings/connectors?${claudeConnectorQuery(origin)}`;
}

/** The query both Claude install links take: the form to open, and the name and URL to fill in, percent-encoded. */
function claudeConnectorQuery(origin: string): string {
  return new URLSearchParams({ modal: "add-custom-connector", connectorName: CLAUDE_CONNECTOR_NAME, connectorUrl: mcpEndpoint(origin) }).toString();
}

/**
 * The name the Codex app's "Add custom MCP server" form takes. The app
 * lists the server as a plugin under this name; the CLI keeps its own
 * entry, named `artifacts`.
 */
export const CODEX_PLUGIN_NAME = "artifacts.space";

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
 * The Codex command that lists the configured servers, to check that the
 * server was added.
 * Source: https://learn.chatgpt.com/docs/extend/mcp?surface=cli ("Run codex
 * mcp list to confirm the server is configured")
 */
export function codexMcpListCommand(): string {
  return "codex mcp list";
}

/**
 * The `~/.codex/config.toml` entry. The Codex CLI and the IDE extension
 * share this file.
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

/**
 * Where ChatGPT on the web adds a custom MCP server: the Plugins page, then
 * "+" and "Add custom MCP server". Developer mode is no longer needed first.
 * ChatGPT on the web does not read the Codex config, so a server added for
 * Codex is added here again.
 * Sources: https://developers.openai.com/api/docs/guides/custom-mcp-server,
 * https://developers.openai.com/plugins/deploy/connect-chatgpt, and
 * https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
 */
export const CHATGPT_PLUGINS_URL = "https://chatgpt.com/plugins";

/**
 * The message that asks a Grok Bot to add the server. Grok Bot documents no
 * install link; a Bot can add an MCP server by its URL when asked in chat.
 * Source: https://docs.x.ai/grok-bot/computer-and-apps
 */
export function grokBotAddMessage(origin: string): string {
  return `Add the MCP server at ${mcpEndpoint(origin)} and name it ${MCP_SERVER_NAME}.`;
}

/**
 * Where Grok on the web adds a custom connector: "New Connector", then
 * "Custom", then the server URL.
 * Source: https://docs.x.ai/grok/connectors
 */
export const GROK_CONNECTORS_URL = "https://grok.com/connectors";

/**
 * The OpenCode command that adds the server to the project config. `--url`
 * makes it a remote Streamable HTTP server, which uses OAuth by default.
 * Source: https://opencode.ai/docs/mcp-servers/
 */
export function opencodeMcpAddCommand(origin: string): string {
  return `opencode mcp add ${MCP_SERVER_NAME} --url ${mcpEndpoint(origin)}`;
}

/**
 * The OpenCode sign-in command. It starts the same browser sign-in as
 * choosing the server from `/mcps` in OpenCode.
 * Source: https://opencode.ai/docs/mcp-servers/
 */
export function opencodeMcpAuthCommand(): string {
  return `opencode mcp auth ${MCP_SERVER_NAME}`;
}

/** The OpenCode command that lists servers and whether each one is connected. */
export function opencodeMcpListCommand(): string {
  return "opencode mcp list";
}

/**
 * The OpenCode `opencode.json` entry for a remote server. Servers sit under
 * `mcp.servers`, never directly under `mcp`.
 * Source: https://opencode.ai/docs/mcp-servers/
 */
export function opencodeConfigJson(origin: string): string {
  const config = {
    $schema: "https://opencode.ai/config.json",
    mcp: { servers: { [MCP_SERVER_NAME]: { type: "remote", url: mcpEndpoint(origin) } } },
  };
  return JSON.stringify(config, null, 2);
}

/**
 * The Kimi Code CLI sign-in, typed inside Kimi Code: a slash command, not a
 * shell command. Kimi Code CLI replaced the archived Kimi CLI and has no
 * `kimi mcp add`; servers go in `mcp.json` or through `/mcp-config`.
 * Source: https://moonshotai.github.io/kimi-code/en/customization/mcp.html
 */
export function kimiMcpLoginCommand(): string {
  return `/mcp-config login ${MCP_SERVER_NAME}`;
}

/**
 * The fx installer, from fx's own docs. It puts `fx` in `~/.local/bin` on
 * macOS and Linux.
 * Source: https://fx.sh/docs/getting-started/installation
 */
export const FX_INSTALL_COMMAND = "curl -fsSL https://fx.sh/setup.sh | bash";

/**
 * The fx command that adds the server to `~/.fx/mcp.json`. A URL makes it a
 * remote Streamable HTTP server, and fx opens the browser sign-in at once
 * when the server asks for one.
 * Source: https://fx.sh/docs/using-fx/cli#mcp-management
 */
export function fxMcpAddCommand(origin: string): string {
  return `fx mcp add ${MCP_SERVER_NAME} ${mcpEndpoint(origin)}`;
}

/**
 * The fx sign-in command, for signing in later or again. It uses dynamic
 * client registration and a loopback callback.
 * Source: https://fx.sh/docs/capabilities/mcp#sign-in-to-a-remote-server
 */
export function fxMcpLoginCommand(): string {
  return `fx mcp login ${MCP_SERVER_NAME}`;
}

/**
 * The fx command that connects to the server and lists its status and tools.
 * Source: https://fx.sh/docs/using-fx/cli#mcp-management
 */
export function fxMcpShowCommand(): string {
  return `fx mcp show ${MCP_SERVER_NAME}`;
}

/**
 * The skill install, typed inside fx: a slash command, not a shell command.
 * fx installs it to `~/.fx/skills/`, for every project.
 * Source: https://fx.sh/docs/capabilities/skills#install
 */
export function fxSkillInstallCommand(): string {
  return `/skills install ${SKILLS_REPO}`;
}

/**
 * The `~/.fx/mcp.json` entry for a remote server. fx reads `"type": "http"`
 * as Streamable HTTP; a project's `.mcp.json` takes the same shape.
 * Source: https://fx.sh/docs/capabilities/mcp#project-configuration-and-trust
 */
export function fxConfigJson(origin: string): string {
  return JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: mcpEndpoint(origin) } } }, null, 2);
}

/** The clients the docs give setup steps for, most used first. Every list of clients reads this order. */
export const mcpClients = [
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "codex", label: "Codex" },
  { id: "grok-bot", label: "Grok Bot" },
  { id: "opencode", label: "OpenCode" },
  { id: "devin", label: "Devin" },
  { id: "kimi-code", label: "Kimi Code CLI" },
  { id: "fx", label: "fx" },
  { id: "other-clients", label: "Other clients" },
] as const;

/** The id of a client in `mcpClients`, also its heading anchor on the clients page. */
export type McpClientId = (typeof mcpClients)[number]["id"];

/**
 * The desktop apps the Connections page gives an "Add to" button, in the
 * order it shows them: the two with an install link first (Cursor, Claude),
 * then Codex and Grok Bot, which publish none, so their buttons open
 * their steps in the docs.
 */
export const desktopApps = ["cursor", "claude-desktop", "codex", "grok-bot"] as const satisfies readonly McpClientId[];

/** The id of a desktop app with an "Add to" button. */
export type DesktopAppId = (typeof desktopApps)[number];
