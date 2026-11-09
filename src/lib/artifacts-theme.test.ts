import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactRecord, ArtifactVersionRecord } from "@/db/schema";
import { presetTheme } from "@/lib/themes/resolve";

/*
 * Artifact themes at the data layer: the update schema checks and normalises
 * them, and restoring a version brings its theme back through the same save
 * path (and so the same approval rule) as any edit. The database and the
 * modules around a save are mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  getEditableArtifact: vi.fn(),
  getVersionOf: vi.fn(),
  recordArtifactSave: vi.fn(),
}));

vi.mock("@/db", () => {
  const rows = (value: unknown[]) => ({ where: () => Promise.resolve(value) });
  return {
    getDb: () => ({
      update: () => ({
        set: (values: Record<string, unknown>) => {
          mocks.set(values);
          return { where: () => ({ returning: () => Promise.resolve([{ ...baseRecord, ...values }]) }) };
        },
      }),
      select: () => ({ from: () => rows([]) }),
    }),
  };
});
vi.mock("@/lib/access", () => ({ getEditableArtifact: mocks.getEditableArtifact, viewableInTeamCondition: vi.fn() }));
vi.mock("@/lib/versions/history", () => ({ getVersionOf: mocks.getVersionOf }));
vi.mock("@/lib/versions/service", () => ({ recordArtifactSave: mocks.recordArtifactSave }));
vi.mock("@/lib/versions/cache", () => ({ forgetArtifactCache: vi.fn() }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: () => Promise.resolve() }));
vi.mock("@/lib/quota/usage", () => ({ assertContentFits: () => Promise.resolve() }));
vi.mock("@/lib/files/attach", () => ({ checkContentFiles: () => Promise.resolve([]) }));
vi.mock("@/lib/files/icon-file", () => ({ checkIconFile: () => Promise.resolve([]), restorableIcon: (_user: string, _id: string, icon: string | null) => Promise.resolve(icon) }));
vi.mock("@/lib/files/icon-cleanup", () => ({ pruneUnusedIconFilesQuietly: () => Promise.resolve() }));
vi.mock("@/lib/files/store", () => ({ attachFileRows: () => Promise.resolve(), deleteArtifactFiles: () => Promise.resolve(), listFilesForArtifacts: () => Promise.resolve(new Map()) }));
vi.mock("@/lib/agents/queries", () => ({ loadActors: () => Promise.resolve(new Map()) }));
vi.mock("@/lib/agents/owner-access", () => ({ ownedAgentIds: () => Promise.resolve(new Set()), authoredByViewerCondition: vi.fn() }));

const baseRecord = {
  id: "artifact-1", publicId: "4fXkP9qR2sT7vW1yZ3aB5c", userId: "user-1", title: "Plan", icon: null, theme: "ocean", cover: null, fullWidth: false, sheetFormat: null, summary: "", content: "# Plan",
  kind: "markdown", language: "", project: "", projectId: null, tags: [], sessionId: "", source: "", harness: null, harnessOverride: null, visibility: "private", comments: "team", showInSearch: false, shareId: "s", teamId: null,
  originalAuthorId: null, metadata: {}, approvedVersionId: null, updatedBy: "user-1", createdAt: new Date(), updatedAt: new Date(),
} satisfies ArtifactRecord;

const { artifactInputSchema, artifactUpdateSchema, restoreArtifactVersion } = await import("./artifacts");

function forest() {
  const theme = presetTheme("forest");
  if (!theme) throw new Error("forest preset missing");
  return theme;
}

describe("artifact theme at the data layer", () => {
  it("should store a preset id when an update names a built-in preset", () => {
    expect(artifactUpdateSchema.parse({ theme: "paper" }).theme).toBe("paper");
  });

  it.each([null, ""])("should store null when an update sends %j", (theme) => {
    expect(artifactUpdateSchema.parse({ theme }).theme).toBeNull();
  });

  it("should leave the theme alone when an update does not mention it", () => {
    expect(artifactUpdateSchema.parse({ title: "New" }).theme).toBeUndefined();
  });

  it("should store the normalised theme when an update sends theme JSON", () => {
    const parsed = artifactUpdateSchema.parse({ theme: { version: 1, light: { ...forest().light, accent: "#1d4ed8" }, dark: forest().dark } });
    expect(parsed.theme).toMatchObject({ version: 1, mode: "auto", radius: "md", fonts: { body: "geist-sans" } });
    expect(typeof parsed.theme === "object" && parsed.theme?.light.accent.startsWith("oklch(")).toBe(true);
  });

  it("should refuse an unknown preset or failing contrast when a person or agent sends one", () => {
    expect(artifactUpdateSchema.safeParse({ theme: "neon" }).success).toBe(false);
    const lowContrast = { version: 1, light: { ...forest().light, mutedForeground: forest().light.background }, dark: forest().dark };
    expect(artifactInputSchema.safeParse({ title: "T", content: "c", theme: lowContrast }).success).toBe(false);
  });
});

describe("restoreArtifactVersion with a theme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEditableArtifact.mockResolvedValue(baseRecord);
    mocks.recordArtifactSave.mockResolvedValue("applied");
  });

  function version(theme: ArtifactVersionRecord["theme"]): Partial<ArtifactVersionRecord> {
    return { id: "version-1", artifactId: "artifact-1", title: "Plan", icon: null, theme, summary: "", content: "# Plan", kind: "markdown", language: "", project: "", source: "", metadata: {} };
  }

  it("should bring the version's preset back when the version had one", async () => {
    mocks.getVersionOf.mockResolvedValue(version("paper"));
    await restoreArtifactVersion("user-1", "artifact-1", "version-1", "agent");
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ theme: "paper" }));
    expect(mocks.recordArtifactSave).toHaveBeenCalledWith(expect.objectContaining({ saveKind: "restore", actor: "agent", restoredFromId: "version-1" }));
  });

  it("should clear the theme when the restored version had none", async () => {
    mocks.getVersionOf.mockResolvedValue(version(null));
    await restoreArtifactVersion("user-1", "artifact-1", "version-1");
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ theme: null }));
  });

  it("should bring custom theme JSON back unchanged when the version saved it", async () => {
    mocks.getVersionOf.mockResolvedValue(version(forest()));
    await restoreArtifactVersion("user-1", "artifact-1", "version-1");
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ theme: forest() }));
  });
});
