import { describe, expect, it } from "vitest";

import { parseAbuseReportEmail } from "./operator-address";

describe("parseAbuseReportEmail", () => {
  it("should return the address when ABUSE_REPORT_EMAIL is one email address", () => {
    expect(parseAbuseReportEmail(" operator@example.com ")).toEqual({ ok: true, email: "operator@example.com" });
  });

  it("should report unset when ABUSE_REPORT_EMAIL is missing or blank", () => {
    expect(parseAbuseReportEmail(undefined)).toEqual({ ok: false, problem: "unset" });
    expect(parseAbuseReportEmail("   ")).toEqual({ ok: false, problem: "unset" });
  });

  it("should refuse the value when ABUSE_REPORT_EMAIL is not one email address", () => {
    expect(parseAbuseReportEmail("operator")).toEqual({ ok: false, problem: "invalid" });
    expect(parseAbuseReportEmail("a@example.com, b@example.com")).toEqual({ ok: false, problem: "invalid" });
  });
});
