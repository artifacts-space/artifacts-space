import { describe, expect, it } from "vitest";

import { fileRequestLimit } from "./download-limit-rules";

describe("fileRequestLimit", () => {
  it("should count a request without a Range header as a file view", () => {
    expect(fileRequestLimit(null)).toBe("fileDownloadByNetwork");
  });

  it("should count a player's first request for the file as a view when it starts at the first byte", () => {
    expect(fileRequestLimit("bytes=0-")).toBe("fileDownloadByNetwork");
    expect(fileRequestLimit("bytes=000-1023")).toBe("fileDownloadByNetwork");
  });

  it("should count seeks and later parts against the playback budget when the range starts later", () => {
    expect(fileRequestLimit("bytes=1048576-")).toBe("fileRangeByNetwork");
    expect(fileRequestLimit("Bytes = 10-20")).toBe("fileRangeByNetwork");
  });

  it("should count a suffix range or a malformed header as a view when it does not name a later start", () => {
    expect(fileRequestLimit("bytes=-500")).toBe("fileDownloadByNetwork");
    expect(fileRequestLimit("items=5-")).toBe("fileDownloadByNetwork");
    expect(fileRequestLimit("")).toBe("fileDownloadByNetwork");
  });
});
