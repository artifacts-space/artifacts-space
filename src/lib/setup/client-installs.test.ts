import { describe, expect, it } from "vitest";

import { docsHeading } from "@/lib/docs/pages";

import {
  codexConfigToml,
  codexHeadlessConfigToml,
  codexMcpAddCommand,
  codexMcpLoginCommand,
  cursorInstallLink,
  FX_INSTALL_COMMAND,
  fxConfigJson,
  fxMcpAddCommand,
  fxMcpLoginCommand,
  fxMcpShowCommand,
  fxSkillInstallCommand,
  kimiMcpLoginCommand,
  mcpClients,
  MOGPLEX_INSTALL_COMMAND,
  mogplexConfigToml,
  mogplexSkillInstallCommand,
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

  it("should write a url entry under mcp_servers when building config.toml", () => {
    expect(codexConfigToml(origin)).toBe(`[mcp_servers.artifacts]\nurl = "${endpoint}"`);
  });

  it("should read the token from the environment when building headless config.toml", () => {
    expect(codexHeadlessConfigToml(origin)).toBe(`[mcp_servers.artifacts]\nurl = "${endpoint}"\nbearer_token_env_var = "ARTIFACTS_SPACE_TOKEN"`);
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

describe("mogplex snippets", () => {
  it("should read the token from the environment, never from the file, when building config.toml", () => {
    const toml = mogplexConfigToml(origin);
    expect(toml).toBe(`[mcp_servers.artifacts]\nurl = "${endpoint}"\nbearer_token_env_var = "ARTIFACTS_SPACE_TOKEN"`);
    expect(toml).not.toMatch(/Bearer |http_headers/);
  });

  it("should install the skill to the project's .agents/skills when building the skill command", () => {
    expect(mogplexSkillInstallCommand()).toBe("npx skills add artifacts-space/skills -a universal");
  });

  it("should use Mogplex's documented installer when showing the install command", () => {
    expect(MOGPLEX_INSTALL_COMMAND).toBe("curl -fsSL https://mogplex.com/install.sh | sh");
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

  it.each([codexConfigToml(origin), codexHeadlessConfigToml(origin), mogplexConfigToml(origin)])("should hold no stdio keys when building config.toml %#", (toml) => {
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

  it("should list fx and Mogplex just before Other clients when listing clients", () => {
    expect(mcpClients.slice(-3).map((client) => client.id)).toEqual(["fx", "mogplex", "other-clients"]);
  });

  it("should give every client a unique id when listing clients", () => {
    const ids = mcpClients.map((client) => client.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should offer a one-click install only for Cursor when listing clients", () => {
    expect(mcpClients.filter((client) => client.oneClick).map((client) => client.id)).toEqual(["cursor"]);
  });
});
