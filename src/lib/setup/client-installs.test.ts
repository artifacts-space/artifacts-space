import { describe, expect, it } from "vitest";

import { docsHeading } from "@/lib/docs/pages";

import {
  codexConfigToml,
  codexHeadlessConfigToml,
  codexMcpAddCommand,
  codexMcpLoginCommand,
  cursorInstallLink,
  mcpClients,
  opencodeConfigJson,
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

describe("remote-only configs", () => {
  const jsonConfigs: [string, unknown][] = [
    ["cursor install link", decodeCursorConfig(cursorInstallLink(origin))],
    ["mcp.json (OAuth)", JSON.parse(mcpOAuthConfigJson(origin))],
    ["mcp.json (token)", JSON.parse(mcpConfigJson(origin))],
    ["opencode.json", JSON.parse(opencodeConfigJson(origin))],
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
    for (const command of [claudeMcpAddOAuthCommand(origin), codexMcpAddCommand(origin)]) {
      expect(command).not.toMatch(/\bnpx\b|mcp-remote| -- /);
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

  it("should offer a one-click install only for Cursor when listing clients", () => {
    expect(mcpClients.filter((client) => client.oneClick).map((client) => client.id)).toEqual(["cursor"]);
  });
});
