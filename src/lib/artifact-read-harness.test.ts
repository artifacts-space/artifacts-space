import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/access", () => ({ getViewableArtifact: vi.fn() }));
vi.mock("@/lib/artifacts", () => ({ lastEditorsFor: vi.fn(), toArtifactDtos: vi.fn() }));
vi.mock("@/lib/files/download", () => ({ filesForViewer: vi.fn() }));

const { servedHarness } = await import("./artifact-read");

/* The harness in artifacts_get and the workspace follows the version the viewer reads. */

const latest = { id: "cursor", stamped: "cursor", overridden: false } as const;

describe("servedHarness", () => {
  it("should give the row's harness when the viewer reads the latest version", () => {
    expect(servedHarness(latest, { version: { source: "latest", versionId: null }, served: { title: "", icon: null, theme: null, cover: null, updatedAt: new Date(), editedBy: null, harness: "cursor" } })).toEqual(latest);
  });

  it("should give the approved version's harness when the viewer reads that version", () => {
    const served = { title: "", icon: null, theme: null, cover: null, updatedAt: new Date(), editedBy: null, harness: "claude-code" as const };
    expect(servedHarness(latest, { version: { source: "approved", versionId: "v1" }, served })).toEqual({ id: "claude-code", stamped: null, overridden: false });
    expect(servedHarness(latest, { version: { source: "approved", versionId: "v1" }, served: { ...served, harness: null } })).toBeNull();
  });
});
