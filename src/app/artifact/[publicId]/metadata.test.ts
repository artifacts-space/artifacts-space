import { beforeEach, describe, expect, it, vi } from "vitest";

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

function viewable(visibility: string, view: { title: string; icon: string | null; summary: string }) {
  return { record: { publicId: "abc123", visibility, userId: "u1" }, view };
}

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

  it("should not index and add no artifact tags when the artifact is not found", async () => {
    mocks.getViewableArtifact.mockResolvedValue(null);
    const metadata = await call();
    expect(metadata).toEqual({ title: "Artifact not found", robots: { index: false, follow: false } });
    expect(mocks.artifactOgMetadata).not.toHaveBeenCalled();
  });
});
