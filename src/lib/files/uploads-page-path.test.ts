import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Requesting and finishing an upload with a page path, with the database,
 * file storage, the quota, and the rate limit mocked at their boundaries.
 */

const db = vi.hoisted(() => ({ inserted: [] as Record<string, unknown>[], updated: [] as Record<string, unknown>[], row: {} }));
const r2 = vi.hoisted(() => ({ presignUpload: vi.fn(), headObject: vi.fn(), readObjectStart: vi.fn() }));
const store = vi.hoisted(() => ({ countPendingUploads: vi.fn(), getFileRow: vi.fn(), removeFiles: vi.fn() }));

vi.mock("@/db", () => ({
  getDb: () => ({
    insert: () => ({ values: (row: Record<string, unknown>) => ({ returning: () => { db.inserted.push(row); return Promise.resolve([{ ...row, artifactId: null, replacedAt: null, createdAt: new Date(0) }]); } }) }),
    update: () => ({ set: (change: Record<string, unknown>) => ({ where: () => ({ returning: () => { db.updated.push(change); return Promise.resolve([{ ...db.row, ...change }]); } }) }) }),
  }),
}));
vi.mock("./r2", () => ({ ...r2, r2ConfigFromEnv: () => ({}) }));
vi.mock("./store", async (original) => ({ ...(await original<Record<string, unknown>>()), ...store }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/quota/usage", () => ({ assertFileFits: vi.fn() }));

const { finalizeUpload, requestUpload } = await import("./uploads");

beforeEach(() => {
  vi.clearAllMocks();
  db.inserted.length = 0;
  db.updated.length = 0;
  store.countPendingUploads.mockResolvedValue(0);
  r2.presignUpload.mockResolvedValue({ url: "https://storage.example/put", method: "PUT", headers: {}, expiresAt: new Date(0) });
});

describe("requestUpload with a page path", () => {
  it("should take the name and the type from the path, and keep the path on the upload", async () => {
    const started = await requestUpload("author", { pagePath: "js/app.js", size: 120 });
    expect(db.inserted[0]).toMatchObject({ filename: "app.js", contentType: "text/javascript", size: 120, status: "pending", pagePath: "js/app.js", uploaderId: "author" });
    expect(r2.presignUpload.mock.lastCall?.[1]).toMatchObject({ contentType: "text/javascript", size: 120 });
    expect(started.file.pagePath).toBe("js/app.js");
  });

  it("should not read a declared type or name: the path alone says what the file is served as", async () => {
    await requestUpload("author", { pagePath: "css/site.css", filename: "page.html", contentType: "text/html", size: 10 });
    expect(db.inserted[0]).toMatchObject({ filename: "site.css", contentType: "text/css", pagePath: "css/site.css" });
  });

  it.each(["index.html", "../site.css", "/site.css", "run.exe", "css/site.css?x", ".env"])("should refuse the path %s before any upload URL is signed", async (pagePath) => {
    await expect(requestUpload("author", { pagePath, size: 10 })).rejects.toThrow();
    expect(r2.presignUpload).not.toHaveBeenCalled();
    expect(db.inserted).toHaveLength(0);
  });

  it("should refuse a page file over the per-file cap", async () => {
    await expect(requestUpload("author", { pagePath: "img/big.png", size: 26 * 1024 * 1024 })).rejects.toThrow("The limit is 25 MB");
    expect(r2.presignUpload).not.toHaveBeenCalled();
  });

  it("should keep refusing a stylesheet or a script that is requested without a page path", async () => {
    await expect(requestUpload("author", { filename: "site.css", size: 10 })).rejects.toThrow();
    await expect(requestUpload("author", { filename: "app.js", contentType: "text/javascript", size: 10 })).rejects.toThrow();
    await expect(requestUpload("author", { size: 10 })).rejects.toThrow("Give the file a name.");
    expect(db.inserted).toHaveLength(0);
  });
});

describe("finalizeUpload for a page file", () => {
  const row = (over: Record<string, unknown>) => ({ id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", uploaderId: "author", artifactId: null, key: "files/x/app.js", filename: "app.js", contentType: "text/javascript", size: 20, status: "pending", pagePath: "js/app.js", replacedAt: null, createdAt: new Date(), ...over });
  const text = new TextEncoder().encode("export const a = 1;\n");
  /** The pending upload the store answers with. */
  const pending = (over: Record<string, unknown> = {}) => {
    db.row = row(over);
    store.getFileRow.mockResolvedValue(db.row);
  };

  it("should make a script ready when its stored bytes are text of the stated size and type", async () => {
    pending();
    r2.headObject.mockResolvedValue({ size: 20, contentType: "text/javascript" });
    r2.readObjectStart.mockResolvedValue(text);
    const file = await finalizeUpload("author", "7c9e6679-7425-40de-944b-e07fc1f90ae7");
    expect(db.updated).toEqual([{ status: "ready" }]);
    expect(file.pagePath).toBe("js/app.js");
  });

  it.each([-1, Number.NaN])("should keep the upload and ask for another try when storage reports no size (%s)", async (size) => {
    pending();
    r2.headObject.mockResolvedValue({ size, contentType: "text/javascript" });
    await expect(finalizeUpload("author", "7c9e6679-7425-40de-944b-e07fc1f90ae7")).rejects.toThrow("It was not removed. Try again.");
    expect(store.removeFiles).not.toHaveBeenCalled();
    expect(r2.readObjectStart).not.toHaveBeenCalled();
    expect(db.updated).toHaveLength(0);
  });

  it("should still delete an upload whose stored size is a real size that does not match", async () => {
    pending();
    r2.headObject.mockResolvedValue({ size: 19, contentType: "text/javascript" });
    await expect(finalizeUpload("author", "7c9e6679-7425-40de-944b-e07fc1f90ae7")).rejects.toThrow("The stored file is 19 bytes");
    expect(store.removeFiles).toHaveBeenCalled();
  });

  it("should delete a page file whose bytes are another kind of file", async () => {
    pending({ contentType: "font/woff2", pagePath: "fonts/a.woff2" });
    r2.headObject.mockResolvedValue({ size: 20, contentType: "font/woff2" });
    r2.readObjectStart.mockResolvedValue(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]));
    await expect(finalizeUpload("author", "7c9e6679-7425-40de-944b-e07fc1f90ae7")).rejects.toThrow("does not look like font/woff2");
    expect(store.removeFiles).toHaveBeenCalled();
    expect(db.updated).toHaveLength(0);
  });

  it("should still refuse a script that somehow has no page path", async () => {
    pending({ pagePath: null });
    r2.headObject.mockResolvedValue({ size: 20, contentType: "text/javascript" });
    r2.readObjectStart.mockResolvedValue(text);
    await expect(finalizeUpload("author", "7c9e6679-7425-40de-944b-e07fc1f90ae7")).rejects.toThrow("not supported");
    expect(db.updated).toHaveLength(0);
  });
});

describe("finalizeUpload for an image", () => {
  const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  const be32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
  /** A PNG's signature and header chunk, stating the size given. */
  const png = (width: number, height: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(width), ...be32(height), 8, 6, 0, 0, 0]);
  /** The pending upload the store answers with, and the stored bytes it finds. */
  const stored = (bytes: Uint8Array, over: { contentType?: string; filename?: string; key?: string; pagePath?: string } = {}) => {
    db.row = { id, uploaderId: "author", artifactId: null, key: "files/x/photo.png", filename: "photo.png", contentType: "image/png", size: bytes.length, status: "pending", pagePath: null, width: null, height: null, replacedAt: null, createdAt: new Date(), ...over };
    store.getFileRow.mockResolvedValue(db.row);
    r2.headObject.mockResolvedValue({ size: bytes.length, contentType: over.contentType ?? "image/png" });
    r2.readObjectStart.mockResolvedValue(bytes);
  };

  it("should store the picture's pixel size from its first bytes, and give it with the file", async () => {
    stored(png(1600, 900));
    const file = await finalizeUpload("author", id);
    expect(db.updated).toEqual([{ status: "ready", width: 1600, height: 900 }]);
    expect(file).toMatchObject({ width: 1600, height: 900 });
    expect(r2.readObjectStart.mock.lastCall?.[2]).toBe(262_144);
  });

  it.each([[0xffffffff, 0xffffffff], [70_000, 10], [0, 900]])("should make the image ready with no size when its header states %s by %s", async (width, height) => {
    stored(png(width, height));
    const file = await finalizeUpload("author", id);
    expect(db.updated).toEqual([{ status: "ready" }]);
    expect(file).not.toHaveProperty("width");
    expect(file).not.toHaveProperty("height");
  });

  it("should store no size for an image that is a page's own file: the page lays it out", async () => {
    stored(png(1600, 900), { pagePath: "img/photo.png" });
    await finalizeUpload("author", id);
    expect(db.updated).toEqual([{ status: "ready" }]);
    expect(r2.readObjectStart.mock.lastCall?.[2]).toBeLessThan(1024);
  });

  it("should store no size for a file that is no image, and read only its signature", async () => {
    stored(new TextEncoder().encode("%PDF-1.7\n"), { contentType: "application/pdf", filename: "a.pdf", key: "files/x/a.pdf" });
    await finalizeUpload("author", id);
    expect(db.updated).toEqual([{ status: "ready" }]);
    expect(r2.readObjectStart.mock.lastCall?.[2]).toBeLessThan(1024);
  });
});
