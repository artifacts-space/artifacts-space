import { describe, expect, it } from "vitest";

import { isReportable, parseReportInput, REPORT_DETAILS_MAX_LENGTH } from "./rules";

describe("parseReportInput", () => {
  it("should accept a reason without details when details are left out", () => {
    expect(parseReportInput({ reason: "spam" })).toEqual({ ok: true, data: { reason: "spam", details: "" } });
  });

  it("should trim details when they have surrounding spaces", () => {
    expect(parseReportInput({ reason: "other", details: "  fake login page  " })).toEqual({ ok: true, data: { reason: "other", details: "fake login page" } });
  });

  it("should ask for a reason when none is chosen", () => {
    expect(parseReportInput({ details: "x" })).toEqual({ ok: false, error: "Choose a reason for the report." });
  });

  it("should refuse an unknown reason when the form is tampered with", () => {
    expect(parseReportInput({ reason: "boring" })).toEqual({ ok: false, error: "Choose a reason for the report." });
  });

  it("should refuse details when they are too long", () => {
    const result = parseReportInput({ reason: "spam", details: "x".repeat(REPORT_DETAILS_MAX_LENGTH + 1) });
    expect(result).toEqual({ ok: false, error: "Keep the details to 1000 characters or fewer." });
  });
});

describe("isReportable", () => {
  it("should allow reports when an artifact is shared by link or in public", () => {
    expect(isReportable("link")).toBe(true);
    expect(isReportable("public")).toBe(true);
  });

  it("should refuse reports when an artifact is private or team-only", () => {
    expect(isReportable("private")).toBe(false);
    expect(isReportable("team")).toBe(false);
  });
});
