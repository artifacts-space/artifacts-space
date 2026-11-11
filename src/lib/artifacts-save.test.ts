import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactRecord } from "@/db/schema";
import type * as AgentWriteGuard from "@/lib/edits/agent-write-guard";

import { EditConflictError } from "./edits/conflict-error";
import { encodeBaseVersion } from "./edits/edit-conflict-rules";
import { StaleSaveError } from "./save-guard";

/*
 * Saving an artifact: only people and agents who may edit it can save, a save
 * based on an older version is refused without writing anything, and an
 * autosave's editing-session step reaches the version history. The database
 * and the modules around a save are mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  returned: vi.fn(),
  getEditableArtifact: vi.fn(),
  recordArtifactSave: vi.fn(),
  enforceRateLimit: vi.fn(() => Promise.resolve()),
  hasLiveLease: vi.fn(() => Promise.resolve(false)),
  selected: vi.fn((): unknown[] => []),
  writeAndAttach: vi.fn((rows: unknown[]) => Promise.resolve(rows[0] ?? null)),
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.set(values);
        // The guarded UPDATE goes to writeAndAttach as SQL; here its "SQL" is the rows it would return.
        return { where: () => ({ returning: () => ({ getSQL: () => mocks.returned(values) as unknown[] }) }) };
      },
    }),
    select: () => ({ from: () => ({ where: () => Object.assign(Promise.resolve([]), { limit: () => Promise.resolve(mocks.selected()) }) }) }),
  }),
}));
vi.mock("@/lib/access", () => ({ getEditableArtifact: mocks.getEditableArtifact, viewableInTeamCondition: vi.fn() }));
vi.mock("@/lib/versions/history", () => ({ getVersionOf: vi.fn() }));
vi.mock("@/lib/versions/service", () => ({ recordArtifactSave: mocks.recordArtifactSave }));
vi.mock("@/lib/versions/cache", () => ({ forgetArtifactCache: vi.fn() }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/quota/usage", () => ({ assertContentFits: () => Promise.resolve() }));
vi.mock("@/lib/files/attach", () => ({ checkContentFiles: () => Promise.resolve([]) }));
vi.mock("@/lib/files/icon-file", () => ({ checkIconFile: () => Promise.resolve([]), restorableIcon: vi.fn() }));
vi.mock("@/lib/files/icon-cleanup", () => ({ pruneUnusedIconFilesQuietly: () => Promise.resolve(), pruneUnusedContentFilesQuietly: () => Promise.resolve() }));
vi.mock("@/lib/files/save-attach", () => ({ checkUpdatedContentFiles: () => Promise.resolve({ contentFileIds: ["media-1"], imageFileIds: [] }), writeAndAttach: mocks.writeAndAttach }));
vi.mock("@/lib/files/store", () => ({ attachFileRows: () => Promise.resolve(0), deleteArtifactFiles: () => Promise.resolve(), listFilesForArtifacts: () => Promise.resolve(new Map()) }));
vi.mock("@/lib/edits/agent-write-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof AgentWriteGuard>()),
  hasLiveLease: mocks.hasLiveLease,
  lastSavedBy: () => Promise.resolve({ handle: "charles", harness: null }),
  editingPerson: () => Promise.resolve({ handle: "charles", harness: null }),
}));
vi.mock("@/lib/agents/queries", () => ({ loadActors: () => Promise.resolve(new Map()) }));
vi.mock("@/lib/agents/owner-access", () => ({ ownedAgentIds: () => Promise.resolve(new Set()), authoredByViewerCondition: vi.fn(), findDeletableArtifact: vi.fn() }));

const baseRecord = {
  id: "artifact-1", publicId: "4fXkP9qR2sT7vW1yZ3aB5c", userId: "user-1", title: "Plan", icon: null, theme: null, cover: null, summary: "", content: "# Plan",
  kind: "markdown", language: "", project: "", projectId: null, tags: [], sessionId: "", source: "", harness: null, harnessOverride: null, createRequestId: null, visibility: "private", comments: "team", shareId: "s", teamId: null,
  originalAuthorId: null, metadata: {}, approvedVersionId: null, fullWidth: false, sheetFormat: null, allowCsvDownload: false, showInSearch: false, updatedBy: "user-1", createdAt: new Date(), updatedAt: new Date("2026-11-08T10:00:00.000Z"), personSavedAt: null,
} satisfies ArtifactRecord;

const { updateArtifact } = await import("./artifacts");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEditableArtifact.mockResolvedValue(baseRecord);
  mocks.returned.mockImplementation((values: Record<string, unknown>) => [{ ...baseRecord, ...values, updatedAt: new Date("2026-11-08T10:00:01.000Z"), personSavedAt: null }]);
  mocks.recordArtifactSave.mockResolvedValue("applied");
  mocks.hasLiveLease.mockResolvedValue(false);
});

describe("updateArtifact permissions", () => {
  it.each(["person", "agent"] as const)("should refuse and write nothing when a %s without edit rights saves", async (actor) => {
    mocks.getEditableArtifact.mockResolvedValue(null);
    await expect(updateArtifact("stranger", "artifact-1", { content: "# Taken over" }, actor, { expectedUpdatedAt: baseRecord.updatedAt.toISOString() })).resolves.toBeNull();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
  });

  it("should save when the editor may edit the artifact", async () => {
    const saved = await updateArtifact("user-1", "artifact-1", { content: "# Plan v2" }, "person", { expectedUpdatedAt: baseRecord.updatedAt.toISOString() });
    expect(saved?.content).toBe("# Plan v2");
    expect(mocks.getEditableArtifact).toHaveBeenCalledWith("user-1", { id: "artifact-1" });
  });
});

describe("updateArtifact base-version check", () => {
  it("should refuse with the artifact's public id and file no version when someone saved since the base version", async () => {
    mocks.returned.mockReturnValue([]);
    const save = updateArtifact("user-1", "artifact-1", { content: "# Mine" }, "person", { expectedUpdatedAt: "2026-11-08T09:59:00.000Z" });
    await expect(save).rejects.toBeInstanceOf(StaleSaveError);
    await expect(save).rejects.toMatchObject({ publicId: baseRecord.publicId });
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
  });

  it("should hand the save's uploads to its guarded write, so they attach in the same statement or not at all", async () => {
    await updateArtifact("user-1", "artifact-1", { content: "# Plan v2" }, "person", { expectedUpdatedAt: baseRecord.updatedAt.toISOString() });
    expect(mocks.writeAndAttach).toHaveBeenCalledWith(expect.anything(), "user-1", { contentFileIds: ["media-1"], imageFileIds: [] });
  });

  it("should refuse a base version that is not a date instead of saving blind", async () => {
    await expect(updateArtifact("user-1", "artifact-1", { content: "# Mine" }, "person", { expectedUpdatedAt: "yesterday" })).rejects.toBeInstanceOf(StaleSaveError);
    expect(mocks.returned).not.toHaveBeenCalled();
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
  });
});

describe("updateArtifact agent base version", () => {
  const read = encodeBaseVersion({ versionId: "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f", updatedAt: baseRecord.updatedAt });
  const older = encodeBaseVersion({ versionId: "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f", updatedAt: new Date(baseRecord.updatedAt.getTime() - 60_000) });

  it("should refuse a stale agent save and write nothing when the artifact changed since the agent read it", async () => {
    const save = updateArtifact("user-1", "artifact-1", { content: "# Agent's" }, "agent", { baseVersion: older });
    await expect(save).rejects.toBeInstanceOf(EditConflictError);
    await expect(save).rejects.toMatchObject({ code: "artifact_changed", message: expect.stringContaining("(by @charles via the web)") as string });
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
  });

  it("should save an agent's change when its base version is current", async () => {
    const saved = await updateArtifact("user-1", "artifact-1", { content: "# Agent's" }, "agent", { baseVersion: read });
    expect(saved?.content).toBe("# Agent's");
  });

  it("should refuse an agent's save without a base version while a person types, and write nothing", async () => {
    mocks.hasLiveLease.mockResolvedValue(true);
    await expect(updateArtifact("user-1", "artifact-1", { content: "# Agent's" }, "agent", {})).rejects.toMatchObject({ code: "artifact_being_edited" });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("should refuse a base version the server never handed out", async () => {
    await expect(updateArtifact("user-1", "artifact-1", { content: "# Agent's" }, "agent", { baseVersion: "latest" })).rejects.toThrow(/baseVersion is not one/);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("should refuse an agent's save when the guarded write matches nothing because a person saved in between", async () => {
    mocks.returned.mockReturnValue([]);
    mocks.selected.mockReturnValue([{ updatedAt: new Date(baseRecord.updatedAt.getTime() + 1000) }]);
    await expect(updateArtifact("user-1", "artifact-1", { content: "# Agent's" }, "agent", { baseVersion: read })).rejects.toMatchObject({ code: "artifact_changed" });
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
  });
});

describe("updateArtifact editing sessions", () => {
  it.each(["start", "continue"] as const)("should pass the %s step to the version history when an autosave sends it", async (session) => {
    await updateArtifact("user-1", "artifact-1", { title: "Plan B" }, "person", { expectedUpdatedAt: baseRecord.updatedAt.toISOString(), session });
    expect(mocks.recordArtifactSave).toHaveBeenCalledWith(expect.objectContaining({ saveKind: "edit", session }));
  });

  it.each([
    ["start", "artifactUpdate"],
    ["continue", "artifactAutosave"],
    [undefined, "artifactUpdate"],
  ] as const)("should count a save with the %s step against %s", async (session, limit) => {
    await updateArtifact("user-1", "artifact-1", { title: "Plan B" }, "person", { expectedUpdatedAt: baseRecord.updatedAt.toISOString(), session });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(limit, "user-1");
  });
});

describe("updateArtifact agent harness", () => {
  const codex = { harness: "codex", label: null } as const;

  it("should stamp the artifact and its new version when a save comes over MCP", async () => {
    await updateArtifact("user-1", "artifact-1", { content: "# Plan v2" }, "agent", { harness: codex });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ harness: "codex" }));
    expect(mocks.recordArtifactSave).toHaveBeenCalledWith(expect.objectContaining({ harness: codex }));
  });

  it("should stamp Other agent without the client's own name when the client is unknown", async () => {
    await updateArtifact("user-1", "artifact-1", { content: "# Plan v2" }, "agent", { harness: { harness: "other", label: "zed" } });
    const values = mocks.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(values.harness).toBe("other");
    expect(Object.values(values)).not.toContain("zed");
  });

  it("should leave the artifact's harness alone and record none on the version when a person saves in the web app", async () => {
    await updateArtifact("user-1", "artifact-1", { content: "# Edited by hand" }, "person", { expectedUpdatedAt: baseRecord.updatedAt.toISOString() });
    const values = mocks.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(values).not.toHaveProperty("harness");
    expect(mocks.recordArtifactSave).toHaveBeenCalledWith(expect.objectContaining({ harness: null }));
  });

  it("should record the agent that saved on the version, never the artifact's own choice of label", async () => {
    const overridden = { ...baseRecord, harness: "codex", harnessOverride: "cursor" };
    mocks.getEditableArtifact.mockResolvedValue(overridden);
    mocks.returned.mockImplementation((values: Record<string, unknown>) => [{ ...overridden, ...values, updatedAt: new Date("2026-11-08T10:00:01.000Z") }]);
    await updateArtifact("user-1", "artifact-1", { content: "# Plan v3" }, "agent", { harness: codex });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ harness: "codex" }));
    expect(mocks.set.mock.calls[0]?.[0]).not.toHaveProperty("harnessOverride");
    expect(mocks.recordArtifactSave).toHaveBeenCalledWith(expect.objectContaining({ harness: codex }));
  });
});
