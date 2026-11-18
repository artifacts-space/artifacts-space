import { describe, expect, it } from "vitest";

import { fileLimits } from "@/lib/files/config";

import { pageFileLimits } from "./rules";
import { fromZipWords, pageZipLimits, unpacksAsZip, zipFaultWords } from "./zip-rules";

describe("pageZipLimits", () => {
  it("should cap an entry at the largest file and a zip a little above what one page holds", () => {
    expect(pageZipLimits.maxEntryBytes).toBe(fileLimits.maxBytes);
    expect(pageZipLimits.maxTotalBytes).toBeGreaterThan(pageFileLimits.maxTotalBytes);
    expect(pageZipLimits.maxTotalBytes).toBeLessThanOrEqual(pageFileLimits.maxTotalBytes + fileLimits.maxBytes);
    expect(pageZipLimits.maxZipBytes).toBeLessThanOrEqual(pageZipLimits.maxTotalBytes);
  });
});

describe("unpacksAsZip", () => {
  it("should unpack a zip dropped by itself and leave one inside a dropped folder alone", () => {
    expect(unpacksAsZip({ name: "Site.ZIP", fromFolder: false })).toBe(true);
    expect(unpacksAsZip({ name: "site.zip", fromFolder: true })).toBe(false);
    expect(unpacksAsZip({ name: "site.zip.css", fromFolder: false })).toBe(false);
  });
});

describe("fromZipWords", () => {
  it("should say in one line where a drop's files came from, or nothing when no zip was unpacked", () => {
    expect(fromZipWords([])).toBeNull();
    expect(fromZipWords([{ name: "site.zip", count: 14 }])).toBe("From site.zip: 14 files.");
    expect(fromZipWords([{ name: "a.zip", count: 1 }, { name: "b.zip", count: 2 }])).toBe("From a.zip: 1 file; from b.zip: 2 files.");
  });
});

describe("zipFaultWords", () => {
  it("should name the size and the cap when a zip is too large to unpack", () => {
    expect(zipFaultWords("too-large", 50 * 1024 * 1024)).toBe("This zip is 50 MB. A zip of at most 41 MB can be unpacked here.");
    expect(zipFaultWords("unpacks-too-large", 0)).toContain("more than 41 MB");
  });
});
