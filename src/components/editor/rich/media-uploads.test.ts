import { describe, expect, it, vi } from "vitest";

import { forgetUpload, queueUpload, retryUpload, startUpload, subscribeUpload, uploadedFacts, uploadState, type MediaUploader } from "./media-uploads";

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

  it("should stop the request of an upload that is forgotten while it is on its way", async () => {
    let stopped: AbortSignal | undefined;
    const uploader = vi.fn<MediaUploader>((_file, _onProgress, signal) => { stopped = signal; return new Promise(() => undefined); });
    const uploadId = queueUpload(pdf());
    startUpload(uploadId, uploader);
    await vi.waitFor(() => { expect(uploader).toHaveBeenCalled(); });
    expect(stopped?.aborted).toBe(false);
    forgetUpload(uploadId);
    expect(stopped?.aborted).toBe(true);
  });

  it("should give Retry a request of its own, which the first one's end does not stop", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const uploader = vi.fn<MediaUploader>((_file, _onProgress, signal) => { signals.push(signal); return signals.length === 1 ? Promise.reject(new Error("The upload stopped.")) : Promise.resolve(ready); });
    const uploadId = queueUpload(pdf());
    startUpload(uploadId, uploader);
    await settled(uploadId);
    retryUpload(uploadId, uploader);
    await expect(settled(uploadId)).resolves.toMatchObject({ status: "done" });
    expect(signals[1]).not.toBe(signals[0]);
    expect(signals[1]?.aborted).toBe(false);
    forgetUpload(uploadId);
  });

  it("should keep what an upload answered about its file, for the block that then names the file", async () => {
    const report = { id: "9B2F6C1E-3D4A-4F5B-8C7D-1E2F3A4B5C6D", filename: "q3.pdf", contentType: "application/pdf", size: 48_200 };
    const uploadId = queueUpload(pdf());
    expect(uploadedFacts(report.id)).toBeNull();
    startUpload(uploadId, vi.fn<MediaUploader>().mockResolvedValue(report));
    await expect(settled(uploadId)).resolves.toMatchObject({ status: "done" });
    expect(uploadedFacts(report.id.toLowerCase())).toEqual(report);
    forgetUpload(uploadId);
    expect(uploadedFacts(report.id)).toEqual(report);
  });

  it("should upload an animated WebP as it is, never a redraw that keeps one frame", async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8X"), 10, 0, 0, 0, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const picked = new File([bytes], "loop.webp", { type: "image/webp" });
    const uploader = vi.fn<MediaUploader>().mockResolvedValue({ id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", filename: "loop.webp", contentType: "image/webp" });
    const uploadId = queueUpload(picked);
    startUpload(uploadId, uploader);
    await expect(settled(uploadId)).resolves.toMatchObject({ status: "done" });
    expect(uploader.mock.lastCall?.[0]).toBe(picked);
    forgetUpload(uploadId);
  });

  it("should read as failed when a block names an upload this tab never started", () => {
    expect(uploadState("upload-from-another-tab")).toMatchObject({ status: "failed" });
  });
});
