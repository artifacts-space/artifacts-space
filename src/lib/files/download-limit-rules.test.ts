import { describe, expect, it } from "vitest";

import { fileRequestLimits } from "./download-limit-rules";

const fileId = "7D2C0C9E-4A51-4F53-9A7E-0F1D1E2C3B4A";
const view = [{ name: "fileDownloadByNetwork", subject: "net" }];

describe("fileRequestLimits", () => {
  it("should count a request without a Range header as a file view", () => {
    expect(fileRequestLimits(null, "net", fileId)).toEqual(view);
  });

  it("should count a player's first request for the file as a view when it starts at the first byte", () => {
    expect(fileRequestLimits("bytes=0-", "net", fileId)).toEqual(view);
    expect(fileRequestLimits("bytes=000-1023", "net", fileId)).toEqual(view);
  });

  it("should count seeks against the network's playback total and that file's own cap when the range starts later", () => {
    const playback = [
      { name: "fileRangeByNetwork", subject: "net" },
      { name: "fileRangeByNetworkFile", subject: `net:${fileId.toLowerCase()}` },
    ];
    expect(fileRequestLimits("bytes=1048576-", "net", fileId)).toEqual(playback);
    expect(fileRequestLimits("Bytes = 10-20", "net", fileId)).toEqual(playback);
  });

  it("should count a suffix range, a malformed header, or a malformed id as a view", () => {
    expect(fileRequestLimits("bytes=-500", "net", fileId)).toEqual(view);
    expect(fileRequestLimits("items=5-", "net", fileId)).toEqual(view);
    expect(fileRequestLimits("", "net", fileId)).toEqual(view);
    expect(fileRequestLimits("bytes=5-", "net", "not-a-file-id")).toEqual(view);
  });
});
