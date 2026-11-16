import { afterEach, describe, expect, it, vi } from "vitest";

import { maxPictureBytes } from "./capture-host-rules";
import { blankPicture, fetchPicture, loadPictures, type PictureCache } from "./capture-pictures";

/* A picture request that never answers must not hold the capture pass: one pass runs at a time, so a stalled one would stop every later one. */

/** A fetch that answers only when its signal aborts, as a stalled connection does. */
function stalledFetch() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { reject(new DOMException("The operation timed out.", "TimeoutError")); });
  }));
}

describe("fetchPicture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should give up on a picture that does not answer within the timeout", async () => {
    const fetchMock = stalledFetch();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchPicture("/api/files/one", 20)).toEqual({ problem: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should fetch with the site's cookies only, past the cache, and with a signal", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 404 })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchPicture("/api/files/one")).toEqual({ problem: "status" });
    expect(fetchMock).toHaveBeenCalledWith("/api/files/one", expect.objectContaining({ credentials: "same-origin", cache: "no-store", signal: expect.any(AbortSignal) as AbortSignal }));
  });
});

describe("fetchPicture reasons", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should say empty for a picture without bytes and network for a request that fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(new Blob([]), { status: 200 }))));
    expect(await fetchPicture("/api/files/one")).toEqual({ problem: "empty" });
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await fetchPicture("/api/files/one")).toEqual({ problem: "network" });
  });
});

describe("fetchPicture with a picture the host cannot use", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should say too-large for a picture over what the host inlines", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(new Blob([new Uint8Array(maxPictureBytes + 1)]), { status: 200 }))));
    expect(await fetchPicture("/api/files/one")).toEqual({ problem: "too-large" });
  });

  it("should say unreadable when the browser cannot turn the picture into a data URL", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(new Blob(["picture"]), { status: 200 }))));
    class FailingReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("FileReader", FailingReader);
    expect(await fetchPicture("/api/files/one")).toEqual({ problem: "unreadable" });
  });
});

describe("loadPictures", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should leave a picture blank and say one failed when its request fails, and ask for it only once in a pass", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", fetchMock);
    const file = { id: "one", filename: "chart.png", contentType: "image/png", size: 40, createdAt: "2026-11-16T00:00:00.000Z", replacedAt: null };
    const files = new Map([[file.id, file]]);
    const cache: PictureCache = new Map();
    const api = { pictureUrl: () => "/api/files/one" };
    expect(await loadPictures(["one", "not-attached"], files, api, cache)).toEqual({ urls: new Map([["one", blankPicture]]), failed: true, problems: ["network"] });
    // The second frame that shows it gets the blank picture too, and the pass does not count it twice.
    expect(await loadPictures(["one"], files, api, cache)).toEqual({ urls: new Map([["one", blankPicture]]), failed: true, problems: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
