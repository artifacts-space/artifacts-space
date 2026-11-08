import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";
import { presetTheme } from "@/lib/themes/resolve";
import { unusableTeamPresetMessage } from "@/lib/themes/team-preset-access";
import { UserFacingError } from "@/lib/user-facing-error";

/*
 * Team presets over MCP, through the real server and client: themes_list
 * shows only the caller's own shared teams, and `theme` on create and update
 * takes a team preset id, while the data layer refuses one the artifact
 * cannot use. Storage and team lookups are mocked at their boundaries.
 */

const data = vi.hoisted(() => ({
  createArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  getEditableArtifact: vi.fn(),
  listTeamsForUser: vi.fn(),
  listPresetsForTeams: vi.fn(),
  teamDefaultsFor: vi.fn(),
}));
vi.mock("@/lib/artifacts", () => ({ createArtifact: data.createArtifact, updateArtifact: data.updateArtifact, deleteArtifact: vi.fn(), getOwnArtifactByPublicId: vi.fn(), listArtifacts: vi.fn() }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: data.getEditableArtifact }));
vi.mock("@/lib/artifact-read", () => ({ loadArtifactForViewer: vi.fn() }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: data.listTeamsForUser }));
vi.mock("@/lib/themes/team-presets", () => ({ listPresetsForTeams: data.listPresetsForTeams, teamDefaultsFor: data.teamDefaultsFor }));
vi.mock("@/lib/sharing/comments", () => ({ setArtifactComments: vi.fn() }));
vi.mock("@/lib/sharing/service", () => ({ requestArtifactSharing: vi.fn() }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));

const { registerArtifactTools } = await import("./artifact-tools");
const { registerThemeTools } = await import("./theme-tools");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
const ref = "team:acme-brand-abc234";
const ocean = presetTheme("ocean");

function team(id: string, slug: string, personal: boolean) {
  return { id, slug, name: slug.toUpperCase(), personal, teamSharingNeedsApproval: true, createdBy: null, role: "member", memberId: `m-${id}` };
}

function dto(theme: ArtifactDto["theme"]): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Plan", icon: null, theme, cover: null, fullWidth: false, summary: "", content: "# Plan", kind: "markdown", language: "", project: null, tags: [], sessionId: "", source: "",
    visibility: "private", comments: "team", teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
  };
}

let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId, cover: null });
  data.listTeamsForUser.mockResolvedValue([team("personal-1", "agent", true), team("team-a", "acme", false)]);
  data.listPresetsForTeams.mockResolvedValue(new Map([["team-a", [{ id: "p-1", ref, name: "Acme brand", description: "Our look", theme: ocean, updatedAt: "2026-11-07T00:00:00.000Z" }]]]));
  data.teamDefaultsFor.mockResolvedValue(new Map([["team-a", ref]]));
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerArtifactTools(server, "agent-1", "full");
  registerThemeTools(server, "agent-1", "full");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

async function call(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  return { isError: result.isError === true, text: result.content[0]?.text ?? "" };
}

interface ThemesList {
  presets: { id: string }[];
  teams: { team: string; default: { id: string; name: string } | null; presets: { id: string; name: string; fonts: { body: { family: string } } }[] }[];
}

describe("themes_list", () => {
  it("should list built-ins plus the presets and default of the caller's shared teams only", async () => {
    const result = await call("themes_list", {});
    expect(result.isError).toBe(false);
    const list = JSON.parse(result.text) as ThemesList;
    expect(data.listTeamsForUser).toHaveBeenCalledWith("agent-1");
    // Only teams the caller belongs to are ever asked for, and never a personal team.
    expect(data.listPresetsForTeams).toHaveBeenCalledWith(["team-a"]);
    expect(data.teamDefaultsFor).toHaveBeenCalledWith(["team-a"]);
    expect(list.presets.map((preset) => preset.id)).toContain("paper");
    expect(list.teams).toEqual([{ team: "acme", name: "ACME", default: { id: ref, name: "Acme brand" }, presets: [expect.objectContaining({ id: ref, name: "Acme brand" }) as unknown] }]);
  });

  it("should list no team presets when the caller belongs to no shared team", async () => {
    data.listTeamsForUser.mockResolvedValue([team("personal-1", "agent", true)]);
    data.listPresetsForTeams.mockResolvedValue(new Map());
    data.teamDefaultsFor.mockResolvedValue(new Map());
    const list = JSON.parse((await call("themes_list", {})).text) as ThemesList;
    expect(list.teams).toEqual([]);
    expect(data.listPresetsForTeams).toHaveBeenCalledWith([]);
  });
});

describe("theme with a team preset id", () => {
  it("should pass a team preset id to the data layer on create and update", async () => {
    data.createArtifact.mockResolvedValue(dto(ref));
    expect((await call("artifacts_create", { title: "Plan", content: "# Plan", theme: ref })).isError).toBe(false);
    expect(data.createArtifact).toHaveBeenCalledWith("agent-1", expect.objectContaining({ theme: ref }));

    data.updateArtifact.mockResolvedValue(dto(ref));
    expect((await call("artifacts_update", { id: publicId, theme: ref })).isError).toBe(false);
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { theme: ref }, "agent");
  });

  it("should surface the data layer's refusal when the artifact cannot use the team preset", async () => {
    data.updateArtifact.mockRejectedValue(new UserFacingError(unusableTeamPresetMessage("team:other-xyz789")));
    const result = await call("artifacts_update", { id: publicId, theme: "team:other-xyz789" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("is not a theme preset this artifact can use");
  });

  it("should refuse a malformed team preset id before anything is saved", async () => {
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", theme: "team:Not A Slug" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("is not a theme preset");
    expect(data.createArtifact).not.toHaveBeenCalled();
  });
});
