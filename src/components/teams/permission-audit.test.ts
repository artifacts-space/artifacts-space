import { describe, expect, it } from "vitest";

import type { PermissionAuditView } from "@/lib/teams/role-store";

import { auditSentence } from "./permission-audit";

const entry = (overrides: Partial<PermissionAuditView>): PermissionAuditView => ({ id: "a-1", action: "role_updated", subject: "Member", actorName: "Ada", before: [], after: [], createdAt: "2026-11-09T00:00:00.000Z", ...overrides });

describe("auditSentence", () => {
  it("should say what was added and removed when a role changes", () => {
    expect(auditSentence(entry({ before: ["analytics.view"], after: ["share.team"] }))).toBe("Ada changed Member: added Share with the team; removed See views.");
  });

  it("should name both roles when someone's role changes", () => {
    expect(auditSentence(entry({ action: "member_role_changed", subject: "Lin", before: ["Member"], after: ["Designer"] }))).toBe("Ada changed Lin's role from Member to Designer.");
  });

  it("should list an action this page does not know yet instead of dropping it", () => {
    expect(auditSentence(entry({ action: "role_renamed", subject: "Designer" }))).toBe("Ada changed Designer (role renamed).");
  });

  it("should credit a former member when the person who made the change has left", () => {
    expect(auditSentence(entry({ action: "role_deleted", subject: "Designer", actorName: null }))).toBe("A former member deleted the Designer role.");
  });
});
