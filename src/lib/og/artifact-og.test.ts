import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactAccess } from "@/lib/access";
import type { ArtifactVisibility } from "@/lib/artifact-types";
import { presetTheme as builtInTheme } from "@/lib/themes/resolve";
import { emptyThemeContext, resolveArtifactTheme, type ArtifactThemeContext } from "@/lib/themes/team-preset-rules";

const mocks = vi.hoisted(() => ({
  getSignedOutAccess: vi.fn(),
  cachedVersionView: vi.fn(),
  filesForViewer: vi.fn(),
  resolveThemeFor: vi.fn(),
}));

vi.mock("@/lib/access", () => ({ getSignedOutAccess: mocks.getSignedOutAccess }));
vi.mock("@/lib/versions/cache", () => ({ cachedVersionView: mocks.cachedVersionView }));
vi.mock("@/lib/files/download", () => ({ filesForViewer: mocks.filesForViewer }));
// The team context is the database boundary: each test says what the team default and presets are.
vi.mock("@/lib/themes/artifact-theme-context", () => ({ resolveThemeFor: mocks.resolveThemeFor }));

const { artifactImagePath, artifactOgMetadata, artifactPagePath, loadArtifactOg, shareableVersion } = await import("./artifact-og");
const { siteCardPalette } = await import("./card-palette");
const { ogThemeKey } = await import("./theme-key");

/** Resolves themes against this team context, as resolveThemeFor would after loading it. */
function useThemeContext(context: ArtifactThemeContext = emptyThemeContext) {
  mocks.resolveThemeFor.mockImplementation((_subject: unknown, theme: unknown) => Promise.resolve(resolveArtifactTheme(theme, context)));
}

function presetTheme(id: string) {
  const theme = builtInTheme(id);
  if (!theme) throw new Error(`No preset ${id}`);
  return theme;
}

const siteKey = ogThemeKey(presetTheme("default"));

const approvedId = "11111111-1111-4111-8111-111111111111";
const pendingTitle = "Pending edit title";
const savedAt = new Date("2026-11-01T00:00:00Z");

function access(visibility: ArtifactVisibility, source: "approved" | "latest" = "approved", allowCsvDownload = false): ArtifactAccess {
  const fixture = {
    record: { id: "internal", visibility, title: pendingTitle, allowCsvDownload },
    version: source === "approved" ? { source, versionId: approvedId } : { source, versionId: null },
    served: { title: source === "approved" ? "Approved title" : pendingTitle, icon: null, updatedAt: savedAt, editedBy: null },
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
    useThemeContext();
  });

  it("should decide as a signed-out reader when it looks the artifact up", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(null);
    await artifactOgMetadata("abc");
    expect(mocks.getSignedOutAccess).toHaveBeenCalledWith("abc", null);
  });

  it("should still decide as a signed-out reader when the page hands over its viewer to reuse the loaded row", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(null);
    await artifactOgMetadata("abc", "viewer-1");
    // getSignedOutAccess ignores the viewer's membership and agent ownership (src/lib/access.test.ts).
    expect(mocks.getSignedOutAccess).toHaveBeenCalledWith("abc", "viewer-1");
  });

  it("should point og:image and twitter:image at the approved version with the approved title when the artifact is link", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(access("link"));
    const tags = await artifactOgMetadata("abc");
    const image = { url: `/artifact/abc/og/${approvedId}.${siteKey}`, alt: "Approved title on artifacts.space", width: 1200, height: 630, type: "image/png" };
    expect(tags.openGraph).toMatchObject({ title: "Approved title", images: [image] });
    expect(tags.twitter).toMatchObject({ card: "summary_large_image", title: "Approved title", images: [image] });
    expect(JSON.stringify(tags)).not.toContain(pendingTitle);
  });

  it("should add no tags, keeping the site image, when the artifact is private, team, missing, or has no approved version", async () => {
    for (const result of [null, access("team"), access("private"), access("link", "latest")]) {
      mocks.getSignedOutAccess.mockResolvedValue(result);
      expect(await artifactOgMetadata("abc")).toEqual({});
    }
  });

  it("should describe the approved version with its summary in every description tag, with og:url, when the artifact is public", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(access("public"));
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, summary: "Approved summary." });
    const tags = await artifactOgMetadata("abc");
    expect(mocks.cachedVersionView).toHaveBeenCalledWith(approvedId, savedAt.toISOString());
    expect(tags.description).toBe("Approved summary.");
    expect(tags.openGraph).toMatchObject({ description: "Approved summary.", url: "/artifact/abc" });
    expect(tags.twitter).toMatchObject({ description: "Approved summary." });
  });

  it("should excerpt the approved content when the approved version has no summary", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(access("link"));
    mocks.cachedVersionView.mockResolvedValue(approvedView);
    expect((await artifactOgMetadata("abc")).description).toBe("Approved body.");
  });

  it("should never describe a pending edit when the latest version differs from the approved one", async () => {
    const pending = { summary: "Pending summary secret", content: "Pending body secret" };
    mocks.getSignedOutAccess.mockResolvedValue(access("link"));
    mocks.cachedVersionView.mockImplementation((versionId: string) => Promise.resolve(versionId === approvedId ? approvedView : { ...approvedView, ...pending }));
    const serialized = JSON.stringify(await artifactOgMetadata("abc"));
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain(pendingTitle);
  });

  it("should put the approved emoji before the title in og:title and twitter:title, as in the tab title", async () => {
    const withEmoji = access("public");
    withEmoji.served.icon = "🚀";
    mocks.getSignedOutAccess.mockResolvedValue(withEmoji);
    const tags = await artifactOgMetadata("abc");
    expect(tags.openGraph).toMatchObject({ title: "🚀 Approved title" });
    expect(tags.twitter).toMatchObject({ title: "🚀 Approved title" });
  });

  it("should list the approved files only when a file artifact has no notes or summary", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(access("link"));
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, kind: "file", content: "" });
    mocks.filesForViewer.mockResolvedValue([{ id: "f", filename: "deck.pdf", contentType: "application/pdf", size: 1, createdAt: "" }]);
    expect((await artifactOgMetadata("abc")).description).toBe("1 file: deck.pdf");
    mocks.filesForViewer.mockClear();
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, kind: "file", content: "Signed copies." });
    expect((await artifactOgMetadata("abc")).description).toBe("Signed copies.");
    expect(mocks.filesForViewer).not.toHaveBeenCalled();
  });

  it("should add no description and never read content when the artifact is private, team, missing, or unapproved", async () => {
    for (const result of [null, access("team"), access("private"), access("link", "latest"), access("public", "latest")]) {
      mocks.getSignedOutAccess.mockResolvedValue(result);
      expect((await artifactOgMetadata("abc")).description).toBeUndefined();
    }
    expect(mocks.cachedVersionView).not.toHaveBeenCalled();
    expect(mocks.filesForViewer).not.toHaveBeenCalled();
  });

  it("should keep the site tags when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getSignedOutAccess.mockRejectedValue(new Error("db down"));
    expect(await artifactOgMetadata("abc")).toEqual({});
  });
});

describe("artifactPagePath", () => {
  it("should encode the id into the page path", () => {
    expect(artifactPagePath("a/b")).toBe("/artifact/a%2Fb");
  });
});

describe("artifactImagePath", () => {
  it("should encode the id, the version, and the theme key into the path", () => {
    expect(artifactImagePath("a/b", "v 1", "k_-9abcdef")).toBe("/artifact/a%2Fb/og/v%201.k_-9abcdef");
  });
});

describe("link preview URLs and theme changes", () => {
  const brand = { ref: "team:brand-abc123", teamId: "t1", name: "Brand", theme: presetTheme("ocean") };
  const teamContext = (teamDefault: string | null, theme = brand.theme): ArtifactThemeContext => ({ teamDefault, presets: new Map([["team:brand-abc123", { ...brand, theme }]]) });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cachedVersionView.mockResolvedValue(approvedView);
  });

  async function imageUrl(visibility: ArtifactVisibility = "public"): Promise<unknown> {
    mocks.getSignedOutAccess.mockResolvedValue(access(visibility));
    const images = (await artifactOgMetadata("abc")).openGraph?.images;
    return Array.isArray(images) ? (images[0] as { url?: unknown } | undefined)?.url : undefined;
  }

  it("should give the preview a new URL when the team default changes, with no new version", async () => {
    useThemeContext(teamContext(null));
    const before = await imageUrl();
    useThemeContext(teamContext("paper"));
    const after = await imageUrl();
    expect(before).toBe(`/artifact/abc/og/${approvedId}.${siteKey}`);
    expect(after).toBe(`/artifact/abc/og/${approvedId}.${ogThemeKey(presetTheme("paper"))}`);
    expect(after).not.toBe(before);
  });

  it("should give the preview a new URL when the team preset it uses is edited", async () => {
    useThemeContext(teamContext("team:brand-abc123"));
    const before = await imageUrl();
    const edited = { ...brand.theme, light: { ...brand.theme.light, accent: "oklch(0.45 0.2 20)" } };
    useThemeContext(teamContext("team:brand-abc123", edited));
    const after = await imageUrl();
    expect(after).not.toBe(before);
    expect(after).toBe(`/artifact/abc/og/${approvedId}.${ogThemeKey(edited)}`);
  });

  it("should keep the same URL when nothing about the theme changed", async () => {
    useThemeContext(teamContext("paper"));
    expect(await imageUrl()).toBe(await imageUrl());
  });

  it("should keep private and team artifacts on the generic site image, whatever the team theme", async () => {
    useThemeContext(teamContext("paper"));
    for (const visibility of ["private", "team"] as const) {
      expect(await imageUrl(visibility)).toBeUndefined();
      mocks.getSignedOutAccess.mockResolvedValue(access(visibility));
      expect(await loadArtifactOg("abc", `${approvedId}.${ogThemeKey(presetTheme("paper"))}`)).toBeNull();
    }
    expect(mocks.resolveThemeFor).not.toHaveBeenCalled();
  });

  it("should mark the picture current only when the URL names the theme it is drawn with", async () => {
    useThemeContext(teamContext("paper"));
    mocks.getSignedOutAccess.mockResolvedValue(access("link"));
    const paperKey = ogThemeKey(presetTheme("paper"));
    expect((await loadArtifactOg("abc", `${approvedId}.${paperKey}`))?.themeCurrent).toBe(true);
    expect((await loadArtifactOg("abc", `${approvedId}.${siteKey}`))?.themeCurrent).toBe(false);
    expect((await loadArtifactOg("abc", approvedId))?.themeCurrent).toBe(false);
  });

  it("should never put a team preset's name or id in the preview or its tags", async () => {
    const secret = { ref: "team:acme-q3-launch-x7k2p9", teamId: "t1", name: "Acme Q3 launch", theme: presetTheme("ocean") };
    useThemeContext({ teamDefault: secret.ref, presets: new Map([[secret.ref, secret]]) });
    mocks.getSignedOutAccess.mockResolvedValue(access("public"));
    const tags = await artifactOgMetadata("abc");
    const url = (tags.openGraph?.images as { url: string }[] | undefined)?.[0]?.url ?? "";
    const og = await loadArtifactOg("abc", url.split("/").at(-1) ?? "");
    const serialized = JSON.stringify([tags, og]);
    expect(og?.themeCurrent).toBe(true);
    expect(serialized).not.toContain("Acme Q3 launch");
    expect(serialized).not.toContain("acme-q3-launch");
    expect(serialized).not.toContain("team default");
  });

  it("should stay generic when the theme key is right but the version is not the approved one", async () => {
    useThemeContext(teamContext("paper"));
    mocks.getSignedOutAccess.mockResolvedValue(access("public"));
    expect(await loadArtifactOg("abc", `22222222-2222-4222-8222-222222222222.${ogThemeKey(presetTheme("paper"))}`)).toBeNull();
  });
});

describe("loadArtifactOg", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useThemeContext();
  });

  it("should read only the approved version when an edit is pending", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(access("link"));
    mocks.cachedVersionView.mockResolvedValue(approvedView);
    const og = await loadArtifactOg("abc", approvedId);
    expect(mocks.cachedVersionView).toHaveBeenCalledWith(approvedId, savedAt.toISOString());
    expect(og).toMatchObject({ title: "Approved title", kindLabel: "Markdown", synopsis: { type: "prose", heading: "Approved heading" } });
    expect(JSON.stringify(og)).not.toContain(pendingTitle);
  });

  it("should draw no cell values on the card when a sheet's downloads are off, and the table when they are on", async () => {
    const sheet = { ...approvedView, kind: "csv", content: "name,secret\nAda,s3cret\n" };
    mocks.cachedVersionView.mockResolvedValue(sheet);
    mocks.getSignedOutAccess.mockResolvedValue(access("public", "approved", false));
    const withheld = await loadArtifactOg("abc", approvedId);
    expect(withheld?.synopsis).toEqual({ type: "glyph", glyph: "page", label: "CSV", detail: null });
    expect(JSON.stringify(withheld)).not.toContain("s3cret");

    mocks.getSignedOutAccess.mockResolvedValue(access("public", "approved", true));
    expect((await loadArtifactOg("abc", approvedId))?.synopsis).toEqual({ type: "table", header: ["name", "secret"], rows: [["Ada", "s3cret"]] });
  });

  it("should draw the approved version's icon, never a pending one, when the preview renders", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(access("link"));
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, icon: "tabler:gavel" });
    expect((await loadArtifactOg("abc", approvedId))?.icon).toEqual({ type: "tabler", name: "gavel" });
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, icon: null });
    expect((await loadArtifactOg("abc", approvedId))?.icon).toBeNull();
  });

  it("should draw the card in the approved version's theme, and the site card without one", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(access("link"));
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, theme: "paper" });
    const themed = await loadArtifactOg("abc", approvedId);
    expect(themed?.palette).not.toEqual(siteCardPalette);
    expect(themed?.palette.paper).toMatch(/^#[0-9a-f]{6}$/);
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, theme: null });
    expect((await loadArtifactOg("abc", approvedId))?.palette).toEqual(siteCardPalette);
  });

  it("should use the approved version's gradient cover as the backdrop, and none without a cover", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(access("link"));
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, cover: "dusk" });
    const covered = await loadArtifactOg("abc", approvedId);
    expect(covered?.cover).toMatchObject({ type: "gradient", from: expect.stringMatching(/^#[0-9a-f]{6}$/) as unknown });
    expect(covered?.coverDegraded).toBe(false);
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, cover: null });
    expect((await loadArtifactOg("abc", approvedId))?.cover).toBeNull();
  });

  it("should never put the project or tags in the preview or its meta tags, even when the row and version carry them", async () => {
    const withProject = access("public");
    Object.assign(withProject.record, { projectId: "project-1", project: "Secret project label", tags: ["secret-tag-label"] });
    mocks.getSignedOutAccess.mockResolvedValue(withProject);
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, project: "Secret project label" });
    const serialized = JSON.stringify([await loadArtifactOg("abc", approvedId), await artifactOgMetadata("abc")]);
    expect(serialized).not.toContain("Secret project label");
    expect(serialized).not.toContain("project-1");
    expect(serialized).not.toContain("secret-tag-label");
  });

  it("should return null when the requested version is no longer the approved one", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(access("public"));
    expect(await loadArtifactOg("abc", "22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(mocks.cachedVersionView).not.toHaveBeenCalled();
  });

  it("should return null when the artifact is private, team, or missing", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(null);
    expect(await loadArtifactOg("abc", approvedId)).toBeNull();
    mocks.getSignedOutAccess.mockResolvedValue(access("team"));
    expect(await loadArtifactOg("abc", approvedId)).toBeNull();
    expect(mocks.cachedVersionView).not.toHaveBeenCalled();
  });

  it("should list files only when the artifact holds files", async () => {
    mocks.getSignedOutAccess.mockResolvedValue(access("link"));
    mocks.cachedVersionView.mockResolvedValue({ ...approvedView, kind: "file", content: "" });
    mocks.filesForViewer.mockResolvedValue([{ id: "f", filename: "deck.pdf", contentType: "application/pdf", size: 1, createdAt: "" }]);
    const og = await loadArtifactOg("abc", approvedId);
    expect(og?.synopsis).toEqual({ type: "glyph", glyph: "file", label: "deck.pdf", detail: "PDF" });
  });
});
