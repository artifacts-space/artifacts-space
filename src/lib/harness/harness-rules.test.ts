import { describe, expect, it } from "vitest";

import {
  approvedHarnessOf,
  artifactHarnessOf,
  clientInfoFromBody,
  cleanClientText,
  detectHarness,
  effectiveHarness,
  matchHarness,
  parseClientInfo,
  resolveHarness,
  restampTo,
  stampColumns,
  stampOf,
} from "./harness-rules";
import { harnesses, harnessFor, harnessIds, harnessPhrase } from "./harnesses";

describe("matchHarness", () => {
  it.each([
    ["claude-code", "claude-code"],
    ["Claude Code", "claude-code"],
    ["claude-ai", "claude"],
    ["Anthropic/ClaudeAI", "claude"],
    ["codex-mcp-client", "codex"],
    ["Codex", "codex"],
    ["cursor-vscode", "cursor"],
    ["Cursor", "cursor"],
    ["Visual Studio Code", "vscode-copilot"],
    ["Visual Studio Code - Insiders", "vscode-copilot"],
    ["GitHub Copilot", "vscode-copilot"],
    ["windsurf-client", "windsurf"],
    ["Codeium", "windsurf"],
    ["gemini-cli-mcp-client", "gemini-cli"],
    ["opencode", "opencode"],
    ["Cline", "cline"],
    ["Roo Code", "roo-code"],
    ["roo-cline", "roo-code"],
    ["Kilo Code", "kilo-code"],
    ["goose", "goose"],
    ["amp-mcp-client", "amp"],
    ["Trae", "trae"],
    ["fx", "fx"],
    ["blackbox-cli", "blackbox"],
  ])("should map %s to %s when a client names itself that way", (name, harness) => {
    expect(matchHarness(name)).toBe(harness);
  });

  it.each(["zed", "Continue", "firefox", "example", "mogplex", "", "   "])("should match nothing when the name is %j", (name) => {
    expect(matchHarness(name)).toBeNull();
  });
});

describe("detectHarness", () => {
  it("should use the clientInfo name when a rule knows it", () => {
    expect(detectHarness({ clientName: "claude-code", oauthName: "Some app" })).toEqual({ harness: "claude-code", label: null });
  });

  it("should fall back to the OAuth client name when clientInfo is missing", () => {
    expect(detectHarness({ clientName: null, oauthName: "Cursor" })).toEqual({ harness: "cursor", label: null });
  });

  it("should fall back to the software_id when the name is unknown", () => {
    expect(detectHarness({ oauthName: "My laptop", softwareId: "com.openai.codex" })).toEqual({ harness: "codex", label: null });
  });

  it("should prefer the OAuth name when clientInfo only names an MCP library", () => {
    expect(detectHarness({ clientName: "ai-sdk-mcp-client", oauthName: "Cursor" })).toEqual({ harness: "cursor", label: null });
  });

  it("should become Other agent with the raw name kept when nothing matches", () => {
    expect(detectHarness({ clientName: "zed", oauthName: "Zed Editor" })).toEqual({ harness: "other", label: "zed" });
  });

  it("should keep a generic name as the label when it is all there is", () => {
    expect(detectHarness({ clientName: "ai-sdk-mcp-client" })).toEqual({ harness: "other", label: "ai-sdk-mcp-client" });
  });

  it("should be Other agent without a label when the client gave no name", () => {
    expect(detectHarness({})).toEqual({ harness: "other", label: null });
  });
});

describe("parseClientInfo", () => {
  it("should keep the name and version when clientInfo is well formed", () => {
    expect(parseClientInfo({ name: "claude-code", version: "2.1.0" })).toEqual({ name: "claude-code", version: "2.1.0" });
  });

  it.each([null, "claude-code", 42, { version: "1" }, { name: 7 }, { name: "x".repeat(600) }, { name: "   " }])("should ignore clientInfo %j when it is malformed", (value) => {
    expect(parseClientInfo(value)).toBeNull();
  });

  it("should strip control and bidirectional characters and cap the length when the name is hostile", () => {
    const parsed = parseClientInfo({ name: `evil\u202e\u0000<script>${"a".repeat(200)}`, version: "1\n2" });
    expect(parsed?.name).not.toMatch(/[\u0000\u202e]/);
    expect(parsed?.name.length).toBeLessThanOrEqual(64);
    expect(parsed?.version).toBe("1 2");
  });

  it("should return null when cleaning leaves nothing", () => {
    expect(cleanClientText("\u200b\u0007", 64)).toBeNull();
  });

  it("should never cut an emoji in half when a name reaches the cap", () => {
    const cleaned = cleanClientText(`${"a".repeat(63)}\u{1F916}tail`, 64);
    expect(cleaned).toBe(`${"a".repeat(63)}\u{1F916}`);
    expect(Array.from(cleaned ?? "")).toHaveLength(64);
  });
});

describe("clientInfoFromBody", () => {
  it("should find clientInfo in an initialize request", () => {
    const body = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "codex-mcp-client", version: "0.5" } } };
    expect(clientInfoFromBody(body)).toEqual({ info: { name: "codex-mcp-client", version: "0.5" }, initialize: true });
  });

  it("should find clientInfo in a request's _meta when a newer client sends it every time", () => {
    const body = { jsonrpc: "2.0", id: 7, method: "tools/call", params: { _meta: { "io.modelcontextprotocol/clientInfo": { name: "fx", version: "1.0.0" } }, name: "artifacts_list", arguments: {} } };
    expect(clientInfoFromBody(body)).toEqual({ info: { name: "fx", version: "1.0.0" }, initialize: false });
  });

  it("should prefer the initialize clientInfo in a batch so the connection is recorded", () => {
    const meta = { method: "tools/call", params: { _meta: { "io.modelcontextprotocol/clientInfo": { name: "fx" } } } };
    expect(clientInfoFromBody([meta, { method: "initialize", params: { clientInfo: { name: "goose" } } }])).toEqual({ info: { name: "goose", version: null }, initialize: true });
  });

  it("should look through a batch when one message carries it", () => {
    expect(clientInfoFromBody([{ method: "ping" }, { method: "initialize", params: { clientInfo: { name: "goose" } } }])?.info.name).toBe("goose");
  });

  it("should ignore clientInfo outside initialize when it is not in _meta", () => {
    expect(clientInfoFromBody({ method: "tools/call", params: { clientInfo: { name: "claude-code" } } })).toBeNull();
  });

  it.each([null, "text", { method: 5 }, { params: {} }])("should find nothing when the body is %j", (body) => {
    expect(clientInfoFromBody(body)).toBeNull();
  });
});

describe("harness precedence", () => {
  const detected = { harness: "codex", label: null } as const;

  it("should show the artifact override over the connection override and detection", () => {
    expect(resolveHarness({ artifactOverride: "cursor", connectionOverride: "claude-code", detected })).toEqual({ harness: "cursor", label: null });
  });

  it("should show the connection override over detection when the artifact has none", () => {
    expect(resolveHarness({ artifactOverride: null, connectionOverride: "claude-code", detected })).toEqual({ harness: "claude-code", label: null });
  });

  it("should show what was detected when nobody chose one", () => {
    expect(resolveHarness({ detected: { harness: "other", label: "zed" } })).toEqual({ harness: "other", label: "zed" });
  });

  it("should ignore an override that is not a known harness id", () => {
    expect(resolveHarness({ artifactOverride: "<img>", connectionOverride: "nope", detected })).toEqual(detected);
  });

  it("should show the artifact's override over what its last save stamped", () => {
    expect(effectiveHarness("cursor", "codex")).toBe("cursor");
    expect(effectiveHarness(null, "codex")).toBe("codex");
    expect(effectiveHarness(null, null)).toBeNull();
  });

  it("should describe an artifact's harness for its DTO", () => {
    expect(artifactHarnessOf({ harness: "codex", harnessOverride: "cursor" })).toEqual({ id: "cursor", stamped: "codex", overridden: true });
    expect(artifactHarnessOf({ harness: "codex", harnessOverride: null })).toEqual({ id: "codex", stamped: "codex", overridden: false });
    expect(artifactHarnessOf({ harness: null, harnessOverride: null })).toBeNull();
  });

  it("should write nothing on the artifact when the save came from the web app", () => {
    expect(stampColumns(null)).toEqual({});
  });

  it("should write only the harness id on artifacts, never the client's own name", () => {
    expect(stampColumns({ harness: "other", label: "zed" })).toEqual({ harness: "other" });
    expect(stampColumns({ harness: "codex", label: null })).toEqual({ harness: "codex" });
  });

  it("should keep a stored harness on a snapshot, and none when the artifact had none", () => {
    expect(stampOf("codex")).toEqual({ harness: "codex", label: null });
    expect(stampOf("gone-harness")).toEqual({ harness: "other", label: null });
    expect(stampOf(null)).toBeNull();
  });
});

describe("snapshots and unchanged saves", () => {
  it("should restamp the latest version when another agent saves the same content", () => {
    expect(restampTo({ harness: "claude-code", locked: false }, { harness: "cursor", label: null })).toBe("cursor");
  });

  it("should never restamp a locked version: approved, named by a decision, or filed by another editor", () => {
    expect(restampTo({ harness: "claude-code", locked: true }, { harness: "cursor", label: null })).toBeNull();
  });

  it("should leave the latest version alone when a web save or the same agent changes nothing", () => {
    expect(restampTo({ harness: "claude-code", locked: false }, null)).toBeNull();
    expect(restampTo({ harness: "claude-code", locked: false }, { harness: "claude-code", label: null })).toBeNull();
  });
});

describe("approvedHarnessOf", () => {
  it("should show the approved version's own harness, never the artifact's latest stamp", () => {
    expect(approvedHarnessOf({ harnessOverride: null, approvedHarness: "claude-code" })).toEqual({ id: "claude-code", stamped: "claude-code", overridden: false });
    expect(approvedHarnessOf({ harnessOverride: null, approvedHarness: null })).toBeNull();
  });

  it("should show the artifact's own choice over what the approved version recorded", () => {
    expect(approvedHarnessOf({ harnessOverride: "codex", approvedHarness: "claude-code" })).toEqual({ id: "codex", stamped: "claude-code", overridden: true });
  });
});

describe("harnessPhrase", () => {
  it("should say an unknown agent in a sentence when no rule recognized the client", () => {
    expect(harnessPhrase("other")).toBe("an unknown agent");
    expect(harnessPhrase("retired-id")).toBe("an unknown agent");
    expect(harnessPhrase("codex")).toBe("Codex");
  });
});

describe("harness list", () => {
  it("should list every id once, with Other agent last and no icon for it", () => {
    expect(harnesses.map((harness) => harness.id)).toEqual([...harnessIds]);
    expect(harnesses.at(-1)).toEqual({ id: "other", name: "Other agent", icon: null });
  });

  it("should read an id it no longer knows as Other agent", () => {
    expect(harnessFor("retired-tool").id).toBe("other");
  });

  it("should point every known harness at an icon in public/agent-icons", () => {
    for (const harness of harnesses.filter((item) => item.id !== "other")) expect(harness.icon).toMatch(/^\/agent-icons\/[a-z-]+\.svg$/);
  });
});
