import { describe, expect, it } from "vitest";

import { isReportable, parseReportInput, REPORT_DETAILS_MAX_LENGTH, reportLimitChecks } from "./rules";

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

describe("reportLimitChecks", () => {
  it("should count the artifact from this network, then the network, then the reader when the reader is signed in", () => {
    const checks = reportLimitChecks({ networkKey: "net", artifactId: "art-1", viewerId: "user-1" });
    expect(checks).toEqual([
      { name: "reportByNetworkArtifact", subject: "net:art-1" },
      { name: "reportByNetwork", subject: "net" },
      { name: "reportByUser", subject: "user-1" },
    ]);
  });

  it("should still count the network limits when the reader is signed out", () => {
    expect(reportLimitChecks({ networkKey: "net", artifactId: "art-1", viewerId: null }).map((check) => check.name)).toEqual(["reportByNetworkArtifact", "reportByNetwork"]);
  });

  it("should key the per-artifact limit on both network and artifact when two artifacts are reported", () => {
    const [first] = reportLimitChecks({ networkKey: "net", artifactId: "art-1", viewerId: null });
    const [second] = reportLimitChecks({ networkKey: "net", artifactId: "art-2", viewerId: null });
    expect(first?.subject).not.toBe(second?.subject);
  });
});
