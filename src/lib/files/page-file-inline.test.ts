import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ presignDownload: vi.fn() }));

vi.mock("./r2", () => ({ presignDownload: mocks.presignDownload, r2ConfigFromEnv: () => ({}) }));
vi.mock("@/db", () => ({ getDb: () => { throw new Error("no database in this test"); } }));

const { signedFileUrl } = await import("./download");
const { isInlineType, isAllowedFileType } = await import("./config");
const { canUseFileInArtifact } = await import("./access-rules");
const { offersReplace } = await import("./replace-rules");
const { pageFileContentTypes } = await import("../page-files/rules");

afterEach(() => { vi.clearAllMocks(); });

/** The types only a page file may be: a stylesheet, a script, an SVG, a font, a WebAssembly module. */
const pageOnlyTypes = pageFileContentTypes.filter((type) => !isAllowedFileType(type));

describe("page file types on the site's own file route (/api/files)", () => {
  it("should cover the types a browser could run or apply", () => {
    expect(pageOnlyTypes).toEqual(expect.arrayContaining(["text/css", "text/javascript", "image/svg+xml", "font/woff2", "application/wasm"]));
  });

  it("should never count a type only a page file may be as safe to show inline", () => {
    for (const type of pageOnlyTypes) expect(isInlineType(type), type).toBe(false);
  });

  it("should sign every such file as a download, never inline, whatever the request asks", async () => {
    mocks.presignDownload.mockResolvedValue({ url: "https://storage.example/x", expiresAt: new Date() });
    for (const type of pageOnlyTypes) {
      for (const download of [false, true]) {
        await signedFileUrl({ key: "files/a/b", filename: "name.bin", contentType: type }, { download });
        const signed = mocks.presignDownload.mock.lastCall?.[1] as { disposition: string; contentType: string };
        expect(signed.disposition.startsWith("attachment;"), `${type} download=${String(download)}`).toBe(true);
        expect(signed.disposition).not.toContain("inline");
      }
    }
  });
});

describe("an upload requested as a page file", () => {
  const upload = { status: "ready" as const, uploaderId: "me", artifactId: null, pagePath: "js/app.js" };

  it("should never be usable as a plain file, an icon, a cover, or media, even by its uploader", () => {
    expect(canUseFileInArtifact(upload, "me", null)).toBe(false);
    expect(canUseFileInArtifact(upload, "me", "artifact-1")).toBe(false);
    expect(canUseFileInArtifact({ ...upload, pagePath: null }, "me", "artifact-1")).toBe(true);
    expect(canUseFileInArtifact({ ...upload, pagePath: null }, "someone-else", "artifact-1")).toBe(false);
  });

  it("should stay usable where it already is, once it is a page file of the artifact", () => {
    expect(canUseFileInArtifact({ ...upload, artifactId: "artifact-1" }, "anyone", "artifact-1")).toBe(true);
    expect(canUseFileInArtifact({ ...upload, artifactId: "artifact-1" }, "me", "artifact-2")).toBe(false);
  });

  it("should not be offered Replace in the Files section, which uploads plain files", () => {
    expect(offersReplace({ id: "f1", pagePath: "css/site.css" }, { icon: null, cover: null })).toBe(false);
    expect(offersReplace({ id: "f1" }, { icon: null, cover: null })).toBe(true);
  });
});
