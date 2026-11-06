import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactAccess } from "@/lib/access";
import type { ArtifactVisibility } from "@/lib/artifact-types";

const mocks = vi.hoisted(() => ({
  getArtifactAccess: vi.fn(),
  cachedVersionView: vi.fn(),
  filesForViewer: vi.fn(),
}));

vi.mock("@/lib/access", () => ({ getArtifactAccess: mocks.getArtifactAccess }));
vi.mock("@/lib/versions/cache", () => ({ cachedVersionView: mocks.cachedVersionView }));
vi.mock("@/lib/files/download", () => ({ filesForViewer: mocks.filesForViewer }));

const { artifactImagePath, artifactOgMetadata, loadArtifactOg, shareableVersion } = await import("./artifact-og");

const approvedId = "11111111-1111-4111-8111-111111111111";
const pendingTitle = "Pending edit title";
const savedAt = new Date("2026-11-01T00:00:00Z");

function access(visibility: ArtifactVisibility, source: "approved" | "latest" = "approved"): ArtifactAccess {
  const fixture = {
    record: { id: "internal", visibility, title: pendingTitle },
    version: source === "approved" ? { source, versionId: approvedId } : { source, versionId: null },
    served: { title: source === "approved" ? "Approved title" : pendingTitle, updatedAt: savedAt, editedBy: null },
    canEdit: false,
    isTeamMember: false,
  };
  return fixture as unknown as ArtifactAccess;
}

const approvedView = {
  title: "Approved title",
  summary: "",
  content: "# Approved heading\n\nApproved body.",
  kind: "markdown",
  language: "",
  project: "",
  source: "",
  metadata: {},
  updatedAt: savedAt,
};

describe("shareableVersion", () => {
  it("should return the approved version when the artifact is link or public", () => {
    for (const visibility of ["link", "public"] as const) {
      expect(shareableVersion(access(visibility))).toEqual({ versionId: approvedId, savedAt: savedAt.toISOString() });
    }
  });

  it("should return null when the artifact is private or team, even if access were granted", () => {
    expect(shareableVersion(access("private"))).toBeNull();
    expect(shareableVersion(access("team"))).toBeNull();
  });

  it("should return null when there is no approved version to show", () => {
    expect(shareableVersion(access("link", "latest"))).toBeNull();
    expect(shareableVersion(null)).toBeNull();
  });
});

describe("artifactOgMetadata", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should decide as a signed-out reader when it looks the artifact up", async () => {
    mocks.getArtifactAccess.mockResolvedValue(null);
    await artifactOgMetadata("abc");
    expect(mocks.getArtifactAccess).toHaveBeenCalledWith("abc", null);
  });

  it("should point og:image and twitter:image at the approved version with the approved title when the artifact is link", async () => {
    mocks.getArtifactAccess.mockResolvedValue(access("link"));
    const tags = await artifactOgMetadata("abc");
    const image = { url: `/artifact/abc/og/${approvedId}`, alt: "Approved title on artifacts.space", width: 1200, height: 630, type: "image/png" };
    expect(tags.openGraph).toMatchObject({ title: "Approved title", images: [image] });
    expect(tags.twitter).toMatchObject({ card: "summary_large_image", title: "Approved title", images: [image] });
    expect(JSON.stringify(tags)).not.toContain(pendingTitle);
  });

  it("should add no tags, keeping the site image, when the artifact is private, team, missing, or has no approved version", async () => {
    for (const result of [null, access("team"), access("private"), access("link", "latest")]) {
      mocks.getArtifactAccess.mockResolvedValue(result);
      expect(await artifactOgMetadata("abc")).toEqual({});
    }
  });

  it("should keep the site tags when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getArtifactAccess.mockRejectedValue(new Error("db down"));
    expect(await artifactOgMetadata("abc")).toEqual({});
  });
});

describe("artifactImagePath", () => {
  it("should encode both ids into the path", () => {
    expect(artifactImagePath("a/b", "v 1")).toBe("/artifact/a%2Fb/og/v%201");
  });
});

describe("loadArtifactOg", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should read only the approved version when an edit is pending", async () => {
    mocks.getArtifactAccess.mockResolvedValue(access("link"));
    mocks.cachedVersionView.mockResolvedValue(approvedView);
    const og = await loadArtifactOg("abc", approvedId);
    expect(mocks.cachedVersionView).toHaveBeenCalledWith(approvedId, savedAt.toISOString());
    expect(og).toMatchObject({ title: "Approved title", kindLabel: "Markdown", synopsis: { type: "prose", heading: "Approved heading" } });
    expect(JSON.stringify(og)).not.toContain(pendingTitle);
  });

  it("should return null when the requested version is no longer the approved one", async () => {
    mocks.getArtifactAccess.mockResolvedValue(access("public"));
    expect(await loadArtifactOg("abc", "22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(mocks.cachedVersionView).not.toHaveBeenCalled();
  });

  it("should return null when the artifact is private, team, or missing", async () => {
    mocks.getArtifactAccess.mockResolvedValue(null);
    expect(await loadArtifactOg("abc", approvedId)).toBeNull();
    mocks.getArtifactAccess.mockResolvedValue(access("team"));
    expect(await loadArtifactOg("abc", approvedId)).toBeNull();
    expect(mocks.cachedVersionView).not.toHaveBeenCalled();
  });

  it("should list files only when the artifact holds files", async () => {
    mocks.getArtifactAccess.mockResolvedValue(access("link"));
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, kind: "file", content: "" });
    mocks.filesForViewer.mockResolvedValue([{ id: "f", filename: "deck.pdf", contentType: "application/pdf", size: 1, createdAt: "" }]);
    const og = await loadArtifactOg("abc", approvedId);
    expect(og?.synopsis).toEqual({ type: "glyph", glyph: "file", label: "deck.pdf", detail: "PDF" });
  });
});
