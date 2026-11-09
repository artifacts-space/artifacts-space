import { beforeEach, describe, expect, it, vi } from "vitest";

import { canViewArtifact } from "@/lib/access-rules";
import type { ArtifactVisibility } from "@/lib/artifact-types";
import type * as ArtifactOg from "@/lib/og/artifact-og";

const mocks = vi.hoisted(() => ({
  getViewableArtifact: vi.fn(),
  getSession: vi.fn(),
  artifactOgMetadata: vi.fn(),
  accountCreatedAt: vi.fn(),
}));

vi.mock("@/lib/access", () => ({ getViewableArtifact: mocks.getViewableArtifact }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/account-age", () => ({ accountCreatedAt: mocks.accountCreatedAt }));
vi.mock("@/lib/og/artifact-og", async (importOriginal) => ({
  ...(await importOriginal<typeof ArtifactOg>()),
  artifactOgMetadata: mocks.artifactOgMetadata,
}));

const { generateMetadata } = await import("./page");

function viewable(visibility: ArtifactVisibility, view: { title: string; icon: string | null; summary: string }, showInSearch = false) {
  return { record: { publicId: "abc123", visibility, userId: "u1", showInSearch }, view };
}

const plan = { title: "Plan", icon: null, summary: "" };

function call() {
  return generateMetadata({ params: Promise.resolve({ publicId: "abc123" }), searchParams: Promise.resolve({}) });
}

describe("artifact page generateMetadata", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.accountCreatedAt.mockResolvedValue(new Date("2020-01-01"));
  });

  it("should add the canonical URL and keep the Markdown alternate when the artifact is shared", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable("public", { title: "Plan", icon: null, summary: "" }));
    mocks.artifactOgMetadata.mockResolvedValue({ description: "Approved summary.", openGraph: { url: "/artifact/abc123" } });
    const metadata = await call();
    expect(metadata.alternates).toEqual({ canonical: "/artifact/abc123", types: { "text/markdown": "/artifact/abc123.md" } });
    expect(metadata.description).toBe("Approved summary.");
    expect(metadata.title).toBe("Plan");
  });

  it("should show the viewer's own title but no artifact description when the artifact is private", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable("private", { title: "Secret plan", icon: "🚀", summary: "Private summary" }));
    mocks.artifactOgMetadata.mockResolvedValue({});
    const metadata = await call();
    expect(metadata.title).toBe("🚀 Secret plan");
    expect(metadata.description).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain("Private summary");
  });

  it("should describe only the approved version when a signed-in editor sees a pending edit", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable("link", { title: "Draft title", icon: null, summary: "Pending summary" }));
    mocks.artifactOgMetadata.mockResolvedValue({ description: "Approved summary." });
    const metadata = await call();
    expect(metadata.description).toBe("Approved summary.");
    expect(JSON.stringify(metadata)).not.toContain("Pending summary");
  });

  it("should never put the project or tags in the title or meta tags, even for the author", async () => {
    const authored = viewable("public", { title: "Plan", icon: null, summary: "" });
    Object.assign(authored.record, { projectId: "project-1", project: "Secret project label", tags: ["secret-tag-label"] });
    mocks.getViewableArtifact.mockResolvedValue({ ...authored, canEdit: true });
    mocks.getSession.mockResolvedValue({ user: { id: "u1" } });
    mocks.artifactOgMetadata.mockResolvedValue({ description: "Approved summary." });
    const serialized = JSON.stringify(await call());
    expect(serialized).not.toContain("Secret project label");
    expect(serialized).not.toContain("project-1");
    expect(serialized).not.toContain("secret-tag-label");
  });

  it("should not index when the artifact is private, team, or link, even with the search setting on", async () => {
    mocks.artifactOgMetadata.mockResolvedValue({});
    for (const visibility of ["private", "team", "link"] as const) {
      mocks.getViewableArtifact.mockResolvedValue(viewable(visibility, plan, true));
      expect((await call()).robots).toEqual({ index: false, follow: false });
    }
  });

  it("should not index a public artifact when its author has not turned on search engines", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable("public", plan));
    mocks.artifactOgMetadata.mockResolvedValue({});
    expect((await call()).robots).toEqual({ index: false, follow: false });
  });

  it("should index without following links when the author turned on search engines and the account is established", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable("public", plan, true));
    mocks.artifactOgMetadata.mockResolvedValue({});
    expect((await call()).robots).toEqual({ index: true, follow: false });
  });

  it("should not index an opted-in public artifact when the author's account is new", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable("public", plan, true));
    mocks.artifactOgMetadata.mockResolvedValue({});
    mocks.accountCreatedAt.mockResolvedValue(new Date());
    expect((await call()).robots).toEqual({ index: false, follow: false });
  });

  it("should not index when the account age lookup fails", async () => {
    mocks.getViewableArtifact.mockResolvedValue(viewable("public", plan, true));
    mocks.artifactOgMetadata.mockResolvedValue({});
    mocks.accountCreatedAt.mockRejectedValue(new Error("down"));
    expect((await call()).robots).toEqual({ index: false, follow: false });
  });

  it("should not index and add no artifact tags when the artifact is not found", async () => {
    mocks.getViewableArtifact.mockResolvedValue(null);
    const metadata = await call();
    expect(metadata).toEqual({ title: "Artifact not found", robots: { index: false, follow: false } });
    expect(mocks.artifactOgMetadata).not.toHaveBeenCalled();
  });
});

describe("artifact page generateMetadata for a signed-out link crawler", () => {
  const secret = { title: "Secret staging plan", icon: "🔒", summary: "Secret summary for the team" };

  /**
   * getViewableArtifact stubbed with the real read rule (canViewArtifact): the artifact for a viewer who may read it,
   * null for everyone else. That getViewableArtifact itself refuses signed-out viewers is proven in src/lib/access.test.ts;
   * these tests prove the page asks as the signed-out viewer and leaks nothing when refused.
   */
  function readRuleDecides(visibility: ArtifactVisibility) {
    mocks.getViewableArtifact.mockImplementation((_publicId: string, viewerId: string | null) => {
      const viewer = viewerId ? { userId: viewerId, isTeamMember: false } : null;
      const allowed = canViewArtifact({ userId: "u1", visibility, teamId: "team-1" }, viewer);
      return Promise.resolve(allowed ? viewable(visibility, secret) : null);
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.accountCreatedAt.mockResolvedValue(new Date("2020-01-01"));
    mocks.artifactOgMetadata.mockResolvedValue({});
  });

  for (const visibility of ["private", "team"] as const) {
    it(`should put no artifact title, summary, or tags in the HTML when a signed-out crawler asks for a ${visibility} artifact`, async () => {
      readRuleDecides(visibility);
      const metadata = await call();
      const serialized = JSON.stringify(metadata);
      expect(mocks.getViewableArtifact).toHaveBeenCalledWith("abc123", null);
      expect(serialized).not.toContain(secret.title);
      expect(serialized).not.toContain(secret.summary);
      expect(metadata.title).toBe("Artifact not found");
      expect(metadata.openGraph).toBeUndefined();
      expect(metadata.twitter).toBeUndefined();
    });
  }

  it("should leave description, openGraph, and twitter unset, so the site description and image apply, when the artifact cannot be previewed", async () => {
    // A link artifact a signed-out reader can open but that has no approved version: artifactOgMetadata returns {} for it
    // (src/lib/og/artifact-og.test.ts covers that rule). The real merge with the root's site image is checked on the
    // production build in e2e/link-preview.prod.spec.ts.
    readRuleDecides("link");
    const metadata = await call();
    expect(mocks.artifactOgMetadata).toHaveBeenCalledWith("abc123", null);
    expect(metadata).not.toHaveProperty("description");
    expect(metadata).not.toHaveProperty("openGraph");
    expect(metadata).not.toHaveProperty("twitter");
  });

  it("should use the artifact's own preview tags when it can be previewed", async () => {
    readRuleDecides("link");
    const images = [{ url: "/artifact/abc123/og/v1.key", width: 1200, height: 630, type: "image/png" }];
    mocks.artifactOgMetadata.mockResolvedValue({ openGraph: { title: "Plan", images }, twitter: { card: "summary_large_image", images } });
    const metadata = await call();
    expect(metadata.openGraph?.images).toEqual(images);
    expect(metadata.twitter?.images).toEqual(images);
  });
});
