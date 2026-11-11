import { describe, expect, it, vi } from "vitest";

import { forgetUpload, queueUpload, retryUpload, startUpload, subscribeUpload, uploadState, type MediaUploader } from "./media-uploads";

const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], "q3.pdf", { type: "application/pdf" });
const ready = { id: "0f8fad5b-d9cb-469f-a165-70867728950e", filename: "q3.pdf", contentType: "application/pdf" };

async function settled(uploadId: string) {
  await vi.waitFor(() => { expect(["done", "failed"]).toContain(uploadState(uploadId).status); });
  return uploadState(uploadId);
}

describe("media uploads", () => {
  it("should upload once and report the file when several views start the same upload", async () => {
    const uploader = vi.fn<MediaUploader>((_file, onProgress) => { onProgress(40); return Promise.resolve(ready); });
    const uploadId = queueUpload(pdf());
    const seen = vi.fn();
    const stop = subscribeUpload(uploadId, seen);
    startUpload(uploadId, uploader);
    startUpload(uploadId, uploader);
    await expect(settled(uploadId)).resolves.toEqual({ status: "done", file: ready });
    expect(uploader).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalled();
    stop();
    forgetUpload(uploadId);
  });

  it("should fail without uploading when the file type is not allowed", () => {
    const uploader = vi.fn<MediaUploader>();
    const uploadId = queueUpload(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }));
    startUpload(uploadId, uploader);
    expect(uploadState(uploadId)).toMatchObject({ status: "failed", message: expect.stringContaining("not supported") as unknown });
    expect(uploader).not.toHaveBeenCalled();
  });

  it("should show the uploader's message and upload again when Retry is chosen", async () => {
    const uploader = vi.fn<MediaUploader>().mockRejectedValueOnce(new Error("Storage refused the upload (status 403).")).mockResolvedValueOnce(ready);
    const uploadId = queueUpload(pdf());
    startUpload(uploadId, uploader);
    await expect(settled(uploadId)).resolves.toEqual({ status: "failed", message: "Storage refused the upload (status 403)." });
    retryUpload(uploadId, uploader);
    await expect(settled(uploadId)).resolves.toEqual({ status: "done", file: ready });
    expect(uploader).toHaveBeenCalledTimes(2);
  });

  it("should read as failed when a block names an upload this tab never started", () => {
    expect(uploadState("upload-from-another-tab")).toMatchObject({ status: "failed" });
  });
});
