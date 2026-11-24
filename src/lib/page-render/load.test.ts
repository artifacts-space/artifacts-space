import { beforeEach, describe, expect, it, vi } from "vitest";

import { mintRenderToken } from "./token";

/*
 * The render page's checks: a render token opens one HTML artifact's page,
 * at one save, only while the person who asked may still edit it, and its
 * files address only for that artifact. The database is mocked.
 */

const data = vi.hoisted(() => ({ getEditableArtifactDto: vi.fn(), getArtifactAccess: vi.fn(), pageAddressFor: vi.fn() }));
vi.mock("@/lib/artifacts", () => ({ getEditableArtifactDto: data.getEditableArtifactDto }));
vi.mock("@/lib/access", () => ({ getArtifactAccess: data.getArtifactAccess }));
vi.mock("@/lib/page-files/address", () => ({ pageAddressFor: data.pageAddressFor }));

const { loadRenderPage, renderPageAddress } = await import("./load");

const secret = "a test secret that is long enough to derive keys from";
const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
const savedAt = "2026-11-24T09:30:00.000Z";
const page = "<!doctype html><h1>Launch</h1>";
const dto = { id: "internal-1", publicId, kind: "html", title: "Launch", content: page, updatedAt: savedAt, files: [{ id: "f1", pagePath: "css/site.css", replacedAt: null }] };
const address = { token: "files-token", expiresAt: "2026-11-24T09:45:00.000Z", lifeMs: 600_000 };

function token(overrides: Partial<{ userId: string; artifactId: string; stamp: number }> = {}) {
  return mintRenderToken({ userId: "user-1", artifactId: "internal-1", stamp: Date.parse(savedAt), ...overrides });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  data.getEditableArtifactDto.mockResolvedValue(dto);
  data.getArtifactAccess.mockResolvedValue({ record: { id: "internal-1" }, canEdit: true });
  data.pageAddressFor.mockResolvedValue(address);
});

describe("loadRenderPage", () => {
  it("should give the page and its files key when the token opens and the person may still edit it", async () => {
    expect(await loadRenderPage(token())).toEqual({ publicId, title: "Launch", html: page, filesKey: "f1:css/site.css:" });
    expect(data.getEditableArtifactDto).toHaveBeenCalledWith("user-1", "internal-1");
  });

  it("should give nothing when the person can no longer edit the artifact", async () => {
    data.getEditableArtifactDto.mockResolvedValue(null);
    expect(await loadRenderPage(token())).toBeNull();
  });

  it("should give nothing when the artifact was saved since the token was made", async () => {
    expect(await loadRenderPage(token({ stamp: Date.parse(savedAt) - 1 }))).toBeNull();
  });

  it("should give nothing when the artifact is not an HTML page", async () => {
    data.getEditableArtifactDto.mockResolvedValue({ ...dto, kind: "markdown" });
    expect(await loadRenderPage(token())).toBeNull();
  });

  it("should give nothing and read nothing when the token does not open", async () => {
    expect(await loadRenderPage("not-a-token")).toBeNull();
    expect(data.getEditableArtifactDto).not.toHaveBeenCalled();
  });
});

describe("renderPageAddress", () => {
  it("should make the files address as the person who asked when the page is the token's artifact", async () => {
    expect(await renderPageAddress(token(), publicId)).toEqual(address);
    expect(data.pageAddressFor).toHaveBeenCalledWith({ pageKey: publicId }, "user-1");
  });

  it("should make no address for another artifact the person may read", async () => {
    data.getArtifactAccess.mockResolvedValue({ record: { id: "internal-2" }, canEdit: true });
    expect(await renderPageAddress(token(), "9zYxW8vU7tS6rQ5pO4nM3l")).toBeNull();
    expect(data.pageAddressFor).not.toHaveBeenCalled();
  });

  it("should make no address when the person may only read the artifact", async () => {
    data.getArtifactAccess.mockResolvedValue({ record: { id: "internal-1" }, canEdit: false });
    expect(await renderPageAddress(token(), publicId)).toBeNull();
    expect(data.pageAddressFor).not.toHaveBeenCalled();
  });
});
