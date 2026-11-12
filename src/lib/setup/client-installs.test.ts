import { describe, expect, it } from "vitest";

import { docsHeading } from "@/lib/docs/pages";

import {
  CHATGPT_PLUGINS_URL,
  claudeInstallLink,
  claudeTeamInstallLink,
  codexConfigToml,
  codexHeadlessConfigToml,
  codexMcpAddCommand,
  codexMcpListCommand,
  codexMcpLoginCommand,
  cursorInstallLink,
  desktopApps,
  FX_INSTALL_COMMAND,
  fxConfigJson,
  fxMcpAddCommand,
  fxMcpLoginCommand,
  fxMcpShowCommand,
  fxSkillInstallCommand,
  grokBotAddMessage,
  kimiMcpLoginCommand,
  mcpClients,
  opencodeConfigJson,
  opencodeMcpAddCommand,
  opencodeMcpAuthCommand,
  opencodeMcpListCommand,
  remoteServerConfig,
} from "./client-installs";
import { claudeMcpAddOAuthCommand, mcpConfigJson, mcpOAuthConfigJson } from "./mcp-config";

const origin = "https://artifacts.space";
const endpoint = "https://artifacts.space/api/mcp";

/** The decoded `config` of a Cursor install link, parsed as JSON. */
function decodeCursorConfig(link: string): unknown {
  const url = new URL(link);
  const config = url.searchParams.get("config");
  if (config === null) throw new Error("The link has no config.");
  return JSON.parse(atob(config));
}

/** Every key anywhere in a parsed JSON value. */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...allKeys(child)]);
}

const stdioKeys = new Set(["command", "args", "env", "cwd"]);

/** The stdio keys in a JSON config, which must always be empty. */
function stdioKeysIn(value: unknown): string[] {
  return allKeys(value).filter((key) => stdioKeys.has(key));
}

describe("claudeInstallLink", () => {
  it("should open Claude's add custom connector form with the name and the endpoint when followed", () => {
    const url = new URL(claudeInstallLink(origin));
    expect(url.origin + url.pathname).toBe("https://claude.ai/customize/connectors");
    expect([...url.searchParams.keys()]).toEqual(["modal", "connectorName", "connectorUrl"]);
    expect(url.searchParams.get("modal")).toBe("add-custom-connector");
    expect(url.searchParams.get("connectorName")).toBe("artifacts.space");
    expect(url.searchParams.get("connectorUrl")).toBe(endpoint);
  });

  it("should percent-encode the endpoint when it goes in the query", () => {
    expect(claudeInstallLink(origin)).toContain("connectorUrl=https%3A%2F%2Fartifacts.space%2Fapi%2Fmcp");
    expect(claudeInstallLink("http://localhost:3000")).toContain("connectorUrl=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fmcp");
  });

  it("should open the organization's form with the same values when an owner follows the team link", () => {
    const personal = new URL(claudeInstallLink(origin));
    const team = new URL(claudeTeamInstallLink(origin));
    expect(team.origin + team.pathname).toBe("https://claude.ai/admin-settings/connectors");
    expect(team.search).toBe(personal.search);
  });
});

describe("grokBotAddMessage", () => {
  it("should name the endpoint and the server when asking a Grok Bot to add it", () => {
    expect(grokBotAddMessage(origin)).toBe(`Add the MCP server at ${endpoint} and name it artifacts.`);
  });
});

describe("cursorInstallLink", () => {
  it("should use Cursor's documented deeplink when building the link", () => {
    const url = new URL(cursorInstallLink(origin));
    expect(url.protocol).toBe("cursor:");
    expect(url.host).toBe("anysphere.cursor-deeplink");
    expect(url.pathname).toBe("/mcp/install");
    expect(url.searchParams.get("name")).toBe("artifacts");
  });

  it("should encode the server entry as base64 JSON with only the URL when decoded", () => {
    expect(decodeCursorConfig(cursorInstallLink(origin))).toEqual({ url: endpoint });
  });

  it("should point at the given origin when the site runs elsewhere", () => {
    expect(decodeCursorConfig(cursorInstallLink("http://localhost:3101"))).toEqual({ url: "http://localhost:3101/api/mcp" });
  });

  it("should keep base64 padding intact when the query is parsed", () => {
    const raw = btoa(JSON.stringify(remoteServerConfig(origin)));
    expect(new URL(cursorInstallLink(origin)).searchParams.get("config")).toBe(raw);
  });
});

describe("codex snippets", () => {
  it("should add a Streamable HTTP server by URL when building the add command", () => {
    expect(codexMcpAddCommand(origin)).toBe(`codex mcp add artifacts --url ${endpoint}`);
  });

  it("should name the same server when building the login command", () => {
    expect(codexMcpLoginCommand()).toBe("codex mcp login artifacts");
  });

  it("should list the configured servers when building the check command", () => {
    expect(codexMcpListCommand()).toBe("codex mcp list");
  });

  it("should write a url entry under mcp_servers when building config.toml", () => {
    expect(codexConfigToml(origin)).toBe(`[mcp_servers.artifacts]\nurl = "${endpoint}"`);
  });

  it("should read the token from the environment when building headless config.toml", () => {
    expect(codexHeadlessConfigToml(origin)).toBe(`[mcp_servers.artifacts]\nurl = "${endpoint}"\nbearer_token_env_var = "ARTIFACTS_SPACE_TOKEN"`);
  });
});

describe("chatgpt", () => {
  it("should open ChatGPT's own Plugins page over HTTPS when linking to it", () => {
    const url = new URL(CHATGPT_PLUGINS_URL);
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("chatgpt.com");
    expect(url.pathname).toBe("/plugins");
  });
});

describe("opencode snippets", () => {
  it("should add a remote server by URL when building the add command", () => {
    expect(opencodeMcpAddCommand(origin)).toBe(`opencode mcp add artifacts --url ${endpoint}`);
  });

  it("should name the same server when building the auth command", () => {
    expect(opencodeMcpAuthCommand()).toBe("opencode mcp auth artifacts");
    expect(opencodeMcpListCommand()).toBe("opencode mcp list");
  });

  it("should put the server under mcp.servers as a remote entry when building opencode.json", () => {
    expect(JSON.parse(opencodeConfigJson(origin))).toEqual({
      $schema: "https://opencode.ai/config.json",
      mcp: { servers: { artifacts: { type: "remote", url: endpoint } } },
    });
  });
});

describe("kimi code snippets", () => {
  it("should sign in to the same server when building the login command", () => {
    expect(kimiMcpLoginCommand()).toBe("/mcp-config login artifacts");
  });
});

describe("fx snippets", () => {
  it("should add a remote server by URL with no transport flag when building the add command", () => {
    expect(fxMcpAddCommand(origin)).toBe(`fx mcp add artifacts ${endpoint}`);
  });

  it("should name the same server when building the login and show commands", () => {
    expect(fxMcpLoginCommand()).toBe("fx mcp login artifacts");
    expect(fxMcpShowCommand()).toBe("fx mcp show artifacts");
  });

  it("should write an http entry under mcpServers when building mcp.json", () => {
    expect(JSON.parse(fxConfigJson(origin))).toEqual({ mcpServers: { artifacts: { type: "http", url: endpoint } } });
  });

  it("should install the public skills repository from inside fx when building the skill command", () => {
    expect(fxSkillInstallCommand()).toBe("/skills install artifacts-space/skills");
  });

  it("should use fx's documented installer when showing the install command", () => {
    expect(FX_INSTALL_COMMAND).toBe("curl -fsSL https://fx.sh/setup.sh | bash");
  });
});

describe("remote-only configs", () => {
  const jsonConfigs: [string, unknown][] = [
    ["cursor install link", decodeCursorConfig(cursorInstallLink(origin))],
    ["mcp.json (OAuth)", JSON.parse(mcpOAuthConfigJson(origin))],
    ["mcp.json (token)", JSON.parse(mcpConfigJson(origin))],
    ["opencode.json", JSON.parse(opencodeConfigJson(origin))],
    ["fx mcp.json", JSON.parse(fxConfigJson(origin))],
  ];

  it.each(jsonConfigs)("should hold no stdio fields when building the %s config", (_name, config) => {
    expect(stdioKeysIn(config)).toEqual([]);
  });

  it("should catch a stdio entry when one sneaks into a config", () => {
    expect(stdioKeysIn({ mcpServers: { bad: { command: "npx", args: ["x"] } } })).toEqual(["command", "args"]);
  });

  it.each([codexConfigToml(origin), codexHeadlessConfigToml(origin)])("should hold no stdio keys when building config.toml %#", (toml) => {
    expect(toml).not.toMatch(/^\s*(command|args|env)\s*=/m);
  });

  it("should never run a local command when building any shell snippet", () => {
    for (const command of [claudeMcpAddOAuthCommand(origin), codexMcpAddCommand(origin), opencodeMcpAddCommand(origin), fxMcpAddCommand(origin)]) {
      expect(command).not.toMatch(/\bnpx\b|mcp-remote| -- |stdio/);
      expect(command).toContain(endpoint);
    }
  });
});

describe("mcpClients", () => {
  it("should have a section on the clients page when the picker links to a client", () => {
    for (const client of mcpClients) {
      expect(() => docsHeading("clients", client.id)).not.toThrow();
    }
  });

  it("should list OpenCode and Kimi Code CLI when listing clients", () => {
    expect(mcpClients.map((client) => client.label)).toEqual(expect.arrayContaining(["OpenCode", "Kimi Code CLI"]));
  });

  it("should list fx just before Other clients when listing clients", () => {
    expect(mcpClients.slice(-2).map((client) => client.id)).toEqual(["fx", "other-clients"]);
  });

  it("should give every client a unique id when listing clients", () => {
    const ids = mcpClients.map((client) => client.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should give Cursor, Claude Desktop, Codex, and Grok Bot an Add to button, install links first, when listing desktop apps", () => {
    expect(desktopApps).toEqual(["cursor", "claude-desktop", "codex", "grok-bot"]);
    const known = new Set<string>(mcpClients.map((client) => client.id));
    expect(desktopApps.filter((app) => !known.has(app))).toEqual([]);
  });
});
