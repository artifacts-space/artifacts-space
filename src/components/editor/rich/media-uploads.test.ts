import { afterEach, describe, expect, it, vi } from "vitest";

import { fileLimits } from "@/lib/files/config";
import { webpAnim, webpBytes, webpFrame } from "@/lib/images/image-bytes-harness";

import type { DocumentImageChoice } from "@/components/images/document-image";

import { maxUploadsAtOnce, UploadRequestRefused } from "./media-upload-rules";
import { canRetryUpload, fetchFromLink, forgetUpload, queueUpload, retryUpload, startUpload, subscribeUpload, uploadedFacts, uploadState, type MediaUploader, type UploadedMedia } from "./media-uploads";

/** What a picked image uploads as: the real choice, unless a test sets its answer once. */
const imageChoice = vi.hoisted(() => vi.fn<(file: File) => Promise<DocumentImageChoice>>());
vi.mock("@/components/images/document-image", async (importOriginal) => {
  const real = await importOriginal<{ documentImageToSend: (file: File) => Promise<DocumentImageChoice> }>();
  imageChoice.mockImplementation((file) => real.documentImageToSend(file));
  return { documentImageToSend: imageChoice };
});

const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], "q3.pdf", { type: "application/pdf" });
const ready = { id: "0f8fad5b-d9cb-469f-a165-70867728950e", filename: "q3.pdf", contentType: "application/pdf" };

/** An upload that never finishes by itself and ends, refused, when its request is stopped: what the real upload does on Cancel (put-file.ts). */
function untilStopped(signal: AbortSignal | undefined): Promise<UploadedMedia> {
  return new Promise((_resolve, reject) => { signal?.addEventListener("abort", () => { reject(new Error("The upload was cancelled.")); }, { once: true }); });
}

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

  it("should never upload a file that was refused for the document, and offer no retry", () => {
    const uploader = vi.fn<MediaUploader>();
    const uploadId = queueUpload(pdf(), "A document shows at most 100 files.");
    startUpload(uploadId, uploader);
    retryUpload(uploadId, uploader);
    expect(uploadState(uploadId)).toEqual({ status: "failed", message: "A document shows at most 100 files." });
    expect(canRetryUpload(uploadId)).toBe(false);
    expect(uploader).not.toHaveBeenCalled();
    forgetUpload(uploadId);
  });

  it("should upload a few files at a time and start the next when one ends", async () => {
    const finish: ((file: UploadedMedia) => void)[] = [];
    const uploader = vi.fn<MediaUploader>(() => new Promise((resolve) => { finish.push(resolve); }));
    const ids = Array.from({ length: maxUploadsAtOnce + 2 }, () => queueUpload(pdf()));
    for (const uploadId of ids) startUpload(uploadId, uploader);
    await vi.waitFor(() => { expect(uploader).toHaveBeenCalledTimes(maxUploadsAtOnce); });
    expect(uploadState(ids.at(-1) ?? "")).toEqual({ status: "waiting" });
    // A block removed while its upload waited gives its place to the next one.
    forgetUpload(ids.at(-2) ?? "");
    finish[0]?.(ready);
    await vi.waitFor(() => { expect(uploader).toHaveBeenCalledTimes(maxUploadsAtOnce + 1); });
    for (const done of finish) done(ready);
    await expect(settled(ids.at(-1) ?? "")).resolves.toEqual({ status: "done", file: ready });
    await vi.waitFor(() => { expect(ids.slice(0, maxUploadsAtOnce).every((uploadId) => uploadState(uploadId).status === "done")).toBe(true); });
    expect(uploader).toHaveBeenCalledTimes(maxUploadsAtOnce + 1);
    for (const uploadId of ids) forgetUpload(uploadId);
  });

  it("should stop a cancelled upload's request and give its place to one that waited", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const uploader = vi.fn<MediaUploader>((_file, _onProgress, signal) => { signals.push(signal); return untilStopped(signal); });
    const ids = Array.from({ length: maxUploadsAtOnce + 1 }, () => queueUpload(pdf()));
    for (const uploadId of ids) startUpload(uploadId, uploader);
    await vi.waitFor(() => { expect(uploader).toHaveBeenCalledTimes(maxUploadsAtOnce); });
    expect(uploadState(ids.at(-1) ?? "").status).toBe("waiting");
    // Cancel on the first block: its request stops, and the one that waited starts.
    forgetUpload(ids[0] ?? "");
    expect(signals[0]?.aborted).toBe(true);
    await vi.waitFor(() => { expect(uploader).toHaveBeenCalledTimes(maxUploadsAtOnce + 1); });
    expect(signals.at(-1)?.aborted).toBe(false);
    for (const uploadId of ids) forgetUpload(uploadId);
    expect(signals.every((signal) => signal?.aborted === true)).toBe(true);
  });

  it("should stop the request of an upload that is forgotten while it is on its way", async () => {
    let stopped: AbortSignal | undefined;
    // As the real upload does: the request ends, refused, when it is stopped, which gives its place to the next upload.
    const uploader = vi.fn<MediaUploader>((_file, _onProgress, signal) => { stopped = signal; return untilStopped(signal); });
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
    const bytes = webpBytes({ flags: 0x02, chunks: [webpAnim(), webpFrame(), webpFrame()] });
    const picked = new File([new Uint8Array(bytes)], "loop.webp", { type: "image/webp" });
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

describe("media uploads of an image sent as it is", () => {
  const picked = () => new File([new Uint8Array(5000)], "Screenshot.png", { type: "image/png" });
  const redrawnOf = (size: number) => new File([new Uint8Array(size)], "Screenshot.png", { type: "image/png" });
  const image = { id: "4b0c4e46-3c43-4d4f-9b55-6d2ab7a1c0de", filename: "Screenshot.png", contentType: "image/png" };

  it("should send the redrawn image when the store refuses the original before any byte goes, and the redraw is smaller", async () => {
    const original = picked();
    const redrawn = redrawnOf(3000);
    imageChoice.mockResolvedValueOnce({ file: original, redraw: () => Promise.resolve(redrawn) });
    const uploader = vi.fn<MediaUploader>().mockRejectedValueOnce(new UploadRequestRefused("The file is too large for the room left.")).mockResolvedValueOnce(image);
    const uploadId = queueUpload(original);
    startUpload(uploadId, uploader);
    await expect(settled(uploadId)).resolves.toEqual({ status: "done", file: image });
    expect(uploader.mock.calls.map(([file]) => file)).toEqual([original, redrawn]);
    forgetUpload(uploadId);
  });

  it("should keep the refusal when the redraw is no smaller than the original", async () => {
    const original = picked();
    imageChoice.mockResolvedValueOnce({ file: original, redraw: () => Promise.resolve(redrawnOf(9000)) });
    const uploader = vi.fn<MediaUploader>().mockRejectedValueOnce(new UploadRequestRefused("The file is too large for the room left."));
    const uploadId = queueUpload(original);
    startUpload(uploadId, uploader);
    await expect(settled(uploadId)).resolves.toEqual({ status: "failed", message: "The file is too large for the room left." });
    expect(uploader).toHaveBeenCalledOnce();
    forgetUpload(uploadId);
  });

  it("should not redraw when the upload failed on its way, or when the image was redrawn already", async () => {
    const original = picked();
    const redraw = vi.fn(() => Promise.resolve(redrawnOf(10)));
    imageChoice.mockResolvedValueOnce({ file: original, redraw });
    const uploader = vi.fn<MediaUploader>().mockRejectedValue(new Error("The upload stopped."));
    const first = queueUpload(original);
    startUpload(first, uploader);
    await expect(settled(first)).resolves.toEqual({ status: "failed", message: "The upload stopped." });
    expect(redraw).not.toHaveBeenCalled();
    imageChoice.mockResolvedValueOnce({ file: redrawnOf(10), redraw: null });
    uploader.mockRejectedValueOnce(new UploadRequestRefused("No room."));
    const second = queueUpload(original);
    startUpload(second, uploader);
    await expect(settled(second)).resolves.toEqual({ status: "failed", message: "No room." });
    expect(uploader).toHaveBeenCalledTimes(2);
    forgetUpload(first);
    forgetUpload(second);
  });
});

describe("fetchFromLink", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const megabyte = new Uint8Array(1024 * 1024);
  const limitInMegabytes = fileLimits.maxBytes / megabyte.byteLength;

  /** A site's answer whose body gives `chunks` megabytes, one per read, and counts the reads and whether the request was let go. */
  function answerOf(chunks: number, headers: Record<string, string> = {}) {
    const seen = { reads: 0, cancelled: false };
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (seen.reads >= chunks) { controller.close(); return; }
        seen.reads += 1;
        controller.enqueue(megabyte);
      },
      cancel() { seen.cancelled = true; },
    }, { highWaterMark: 0 });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(body, { headers }))));
    return seen;
  }

  it("should refuse a file over the limit that states no length, without reading it all", async () => {
    const seen = answerOf(400, { "content-type": "image/png" });
    await expect(fetchFromLink("https://example.com/huge.png")).rejects.toThrow(/^That file is too large\. The limit is 25 MB\.$/);
    // It stopped at the first read past the limit, and let the request go.
    expect(seen.reads).toBe(limitInMegabytes + 1);
    expect(seen.cancelled).toBe(true);
  });

  it("should refuse a file whose stated length is wrong as soon as the read passes the limit", async () => {
    const seen = answerOf(400, { "content-type": "image/png", "content-length": "1024" });
    await expect(fetchFromLink("https://example.com/liar.png")).rejects.toThrow("The limit is 25 MB.");
    expect(seen.reads).toBe(limitInMegabytes + 1);
    expect(seen.cancelled).toBe(true);
  });

  it("should refuse a file whose stated length is over the limit before reading any of it", async () => {
    const seen = answerOf(400, { "content-length": String(fileLimits.maxBytes + 1) });
    await expect(fetchFromLink("https://example.com/stated.png")).rejects.toThrow("The limit is 25 MB.");
    expect(seen.reads).toBe(0);
  });

  it("should take a file under the limit that states no length, with its bytes, name, and type", async () => {
    const seen = answerOf(3, { "content-type": "image/png; charset=binary" });
    const file = await fetchFromLink("https://example.com/pictures/chart.png?size=large");
    expect(file.size).toBe(3 * megabyte.byteLength);
    expect(file.name).toBe("chart.png");
    expect(file.type).toBe("image/png");
    expect(seen.reads).toBe(3);
    expect(seen.cancelled).toBe(false);
  });

  it("should take a file of exactly the limit", async () => {
    answerOf(limitInMegabytes, { "content-type": "application/pdf" });
    const file = await fetchFromLink("https://example.com/report.pdf");
    expect(file.size).toBe(fileLimits.maxBytes);
  });
});
