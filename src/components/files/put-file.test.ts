import { afterEach, describe, expect, it, vi } from "vitest";

import { putFile, uploadCancelled } from "./put-file";

/** A request that never answers on its own, so a test decides how it ends. */
class HeldRequest {
  static last: HeldRequest | undefined;
  upload = { onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  aborted = false;
  sent = false;
  open = vi.fn();
  setRequestHeader = vi.fn();
  constructor() { HeldRequest.last = this; }
  send() { this.sent = true; }
  abort() { this.aborted = true; this.onabort?.(); }
}

const file = new File(["bytes"], "photo.png", { type: "image/png" });

afterEach(() => {
  vi.unstubAllGlobals();
  HeldRequest.last = undefined;
});

describe("putFile", () => {
  it("should stop the request and reject when its signal is aborted mid-send", async () => {
    vi.stubGlobal("XMLHttpRequest", HeldRequest);
    const stop = new AbortController();
    const sending = putFile("https://storage.example/put", { "content-type": "image/png" }, file, () => undefined, stop.signal);
    expect(HeldRequest.last?.sent).toBe(true);
    stop.abort();
    await expect(sending).rejects.toThrow(uploadCancelled);
    expect(HeldRequest.last?.aborted).toBe(true);
  });

  it("should send nothing when its signal was aborted before it began", async () => {
    vi.stubGlobal("XMLHttpRequest", HeldRequest);
    const stop = new AbortController();
    stop.abort();
    await expect(putFile("https://storage.example/put", {}, file, () => undefined, stop.signal)).rejects.toThrow(uploadCancelled);
    expect(HeldRequest.last?.sent ?? false).toBe(false);
  });

  it("should still finish a request that nobody stops", async () => {
    vi.stubGlobal("XMLHttpRequest", HeldRequest);
    const sending = putFile("https://storage.example/put", {}, file, () => undefined);
    const request = HeldRequest.last;
    if (!request) throw new Error("no request was made");
    request.status = 200;
    request.onload?.();
    await expect(sending).resolves.toBeUndefined();
  });
});
