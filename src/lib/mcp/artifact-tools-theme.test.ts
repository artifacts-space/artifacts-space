import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";
import { presetTheme } from "@/lib/themes/resolve";

/*
 * artifacts_create and artifacts_update with `theme`, and themes_list, through the real MCP
 * server and client over an in-memory transport: the same input validation
 * and handler an agent reaches. Storage is mocked at the data layer.
 */

const data = vi.hoisted(() => ({
  createArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  deleteArtifact: vi.fn(),
  getOwnArtifactByPublicId: vi.fn(),
  listArtifacts: vi.fn(),
  getEditableArtifact: vi.fn(),
  loadArtifactForViewer: vi.fn(),
}));
vi.mock("@/lib/artifacts", () => ({
  createArtifact: data.createArtifact,
  updateArtifact: data.updateArtifact,
  deleteArtifact: data.deleteArtifact,
  getOwnArtifactByPublicId: data.getOwnArtifactByPublicId,
  listArtifacts: data.listArtifacts,
}));
vi.mock("@/lib/access", () => ({ getEditableArtifact: data.getEditableArtifact }));
vi.mock("@/lib/artifact-read", () => ({ loadArtifactForViewer: data.loadArtifactForViewer }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: () => Promise.resolve([]) }));
vi.mock("@/lib/sharing/comments", () => ({ setArtifactComments: vi.fn() }));
vi.mock("@/lib/sharing/service", () => ({ requestArtifactSharing: vi.fn() }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));

const { registerArtifactTools } = await import("./artifact-tools");
const { registerThemeTools } = await import("./theme-tools");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";

function dto(theme: ArtifactDto["theme"]): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Plan", icon: null, theme, summary: "", content: "# Plan", kind: "markdown", language: "", project: null, sessionId: "", source: "",
    visibility: "private", comments: "team", teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
  };
}

let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId });
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerArtifactTools(server, "agent-1", "full");
  registerThemeTools(server, "full");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

interface ToolText {
  isError?: boolean;
  content: { type: string; text: string }[];
}

async function call(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as ToolText;
  const text = result.content[0]?.text ?? "";
  return { isError: result.isError === true, text };
}

function ocean() {
  const theme = presetTheme("ocean");
  if (!theme) throw new Error("ocean preset missing");
  return theme;
}

describe("artifacts_create with theme", () => {
  it("should pass a preset id to the data layer and return it when the preset exists", async () => {
    data.createArtifact.mockResolvedValue(dto("paper"));
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", theme: "paper" });
    expect(result.isError).toBe(false);
    expect(data.createArtifact).toHaveBeenCalledWith("agent-1", expect.objectContaining({ theme: "paper" }));
    expect((JSON.parse(result.text) as { artifact: { theme: string } }).artifact.theme).toBe("paper");
  });

  it("should accept theme JSON when it validates", async () => {
    data.createArtifact.mockResolvedValue(dto(ocean()));
    const theme = { version: 1, light: { ...ocean().light, accent: "#1d4ed8" }, dark: ocean().dark };
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", theme });
    expect(result.isError).toBe(false);
    expect(data.createArtifact).toHaveBeenCalledWith("agent-1", expect.objectContaining({ theme }));
  });

  it("should refuse an unknown preset with the list of real ones before anything is saved", async () => {
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", theme: "neon" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('"neon" is not a theme preset');
    expect(result.text).toContain("themes_list");
    expect(data.createArtifact).not.toHaveBeenCalled();
  });

  it("should refuse failing contrast with the pair, the ratio, and the nearest passing color", async () => {
    const theme = { version: 1, light: ocean().light, dark: { ...ocean().dark, foreground: "oklch(0.3 0.02 240)" } };
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", theme });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/dark\.foreground on dark\.background is \d+\.\d+:1/);
    expect(result.text).toMatch(/set dark\.foreground to oklch\(/);
    expect(result.text).toContain("/docs/themes#contrast");
    expect(data.createArtifact).not.toHaveBeenCalled();
  });

  it("should refuse a theme that tries to smuggle CSS before anything is saved", async () => {
    const theme = { version: 1, light: { ...ocean().light, background: "url(https://evil.example/x.png)" }, dark: ocean().dark };
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", theme });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("light.background");
    expect(data.createArtifact).not.toHaveBeenCalled();
  });
});

describe("artifacts_update with theme", () => {
  it("should change only the theme through the agent update path when no other field is sent", async () => {
    data.updateArtifact.mockResolvedValue(dto("ink"));
    const result = await call("artifacts_update", { id: publicId, theme: "ink" });
    expect(result.isError).toBe(false);
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { theme: "ink" }, "agent");
  });

  it.each([null, ""])("should pass %j through as a removal when the agent clears the theme", async (theme) => {
    data.updateArtifact.mockResolvedValue(dto(null));
    const result = await call("artifacts_update", { id: publicId, theme });
    expect(result.isError).toBe(false);
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { theme }, "agent");
  });

  it("should report a pending edit when a theme change on a shared artifact waits for approval", async () => {
    data.updateArtifact.mockResolvedValue({ ...dto("forest"), pendingEdit: { requestId: "r1", requestedAt: "2026-11-07T00:00:00.000Z" } });
    const result = await call("artifacts_update", { id: publicId, theme: "forest" });
    expect((JSON.parse(result.text) as { edit: string }).edit).toBe("pending");
  });

  it("should refuse a theme the agent cannot edit before anything is saved", async () => {
    data.getEditableArtifact.mockResolvedValue(null);
    const result = await call("artifacts_update", { id: publicId, theme: "ink" });
    expect(result.isError).toBe(true);
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });
});

describe("themes_list", () => {
  it("should return every preset with its fonts and the allowed custom fonts", async () => {
    const result = await call("themes_list", {});
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.text) as { presets: { id: string; fonts: { body: { family: string } } }[]; customFonts: { body: string[] } };
    expect(parsed.presets.map((preset) => preset.id)).toEqual(expect.arrayContaining(["default", "paper", "editorial"]));
    expect(parsed.presets.find((preset) => preset.id === "paper")?.fonts.body.family).toBe("Work Sans");
    expect(parsed.customFonts.body).not.toContain("instrument-serif");
  });

  it("should describe the theme field on create and update so an agent can act on it", async () => {
    const { tools } = await client.listTools();
    for (const name of ["artifacts_create", "artifacts_update"]) {
      const theme = (tools.find((tool) => tool.name === name)?.inputSchema.properties as Record<string, { description?: string }> | undefined)?.theme;
      expect(theme?.description).toMatch(/themes_list/);
      expect(theme?.description).toMatch(/WCAG AA/);
    }
  });
});
