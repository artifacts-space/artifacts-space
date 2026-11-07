import { describe, expect, it } from "vitest";

import { contentBytesAdded, contentQuotaProblem, fileQuotaProblem, fitsQuota, quotaLimits, storageQuota } from "./rules";

const mb = 1024 * 1024;

describe("fitsQuota", () => {
  it("should allow a change when it stays within the limit", () => {
    expect(fitsQuota({ used: 50 * mb, adding: 10 * mb, limit: 100 * mb })).toBe(true);
    expect(fitsQuota({ used: 90 * mb, adding: 10 * mb, limit: 100 * mb })).toBe(true);
  });

  it("should refuse a change when it goes over the limit", () => {
    expect(fitsQuota({ used: 95 * mb, adding: 10 * mb, limit: 100 * mb })).toBe(false);
  });

  it("should always allow a change that adds nothing, even over the limit", () => {
    expect(fitsQuota({ used: 120 * mb, adding: 0, limit: 100 * mb })).toBe(true);
    expect(fitsQuota({ used: 120 * mb, adding: -5 * mb, limit: 100 * mb })).toBe(true);
  });
});

describe("quota messages", () => {
  it("should say what is used, the limit, and what to do when content is over quota", () => {
    expect(contentQuotaProblem({ used: 99.5 * mb, adding: 2 * mb, limit: storageQuota.contentBytes })).toBe(
      "Artifacts and their saved versions in your account use 100 MB of 100 MB, and this needs 2.0 MB more. Delete or shorten artifacts you no longer need, then try again.",
    );
  });

  it("should name the author's account when a teammate's edit is over the author's quota", () => {
    const message = contentQuotaProblem({ used: 99.5 * mb, adding: 2 * mb, limit: storageQuota.contentBytes }, { self: false, label: "@dana" });
    expect(message).toContain("@dana's account");
    expect(message).toContain("not yours");
    expect(message).not.toContain("your account");
  });

  it("should name the file size and the limit when a file does not fit", () => {
    expect(fileQuotaProblem({ used: 1000 * mb, adding: 25 * mb, limit: storageQuota.fileBytes })).toBe(
      "Files in your account use 1000 MB of 1.0 GB, so this 25 MB file does not fit. Delete files you no longer need, then try again.",
    );
  });

  it("should return null when the change fits", () => {
    expect(contentQuotaProblem({ used: 0, adding: mb, limit: storageQuota.contentBytes })).toBeNull();
    expect(fileQuotaProblem({ used: 0, adding: mb, limit: storageQuota.fileBytes })).toBeNull();
  });
});

describe("quotaLimits", () => {
  it("should use the defaults when no override is set", () => {
    expect(quotaLimits({})).toEqual({ contentBytes: storageQuota.contentBytes, fileBytes: storageQuota.fileBytes });
  });

  it("should use positive whole-number overrides and ignore anything else", () => {
    expect(quotaLimits({ STORAGE_QUOTA_CONTENT_BYTES: "5000", STORAGE_QUOTA_FILE_BYTES: "-1" })).toEqual({ contentBytes: 5000, fileBytes: storageQuota.fileBytes });
    expect(quotaLimits({ STORAGE_QUOTA_CONTENT_BYTES: "lots" }).contentBytes).toBe(storageQuota.contentBytes);
  });
});

describe("contentBytesAdded", () => {
  it("should count the growth plus the new version when a save grows the content", () => {
    expect(contentBytesAdded(3000, 1000)).toBe(2000 + 3000);
  });

  it("should add nothing when a save keeps or shrinks the content", () => {
    expect(contentBytesAdded(1000, 1000)).toBe(0);
    expect(contentBytesAdded(500, 1000)).toBe(0);
  });

  it("should count the content twice when an artifact is created, once for its first version", () => {
    expect(contentBytesAdded(1200, 0)).toBe(2400);
  });
});
