import { describe, expect, it } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";

import { toMcpArtifact, toMcpListItem } from "./artifact-view";

const dto: ArtifactDto = {
  id: "internal-uuid",
  publicId: "4fXkP9qR2sT7vW1yZ3aB5c",
  title: "Plan",
  icon: "🧭",
  theme: null,
  cover: null,
  fullWidth: false,
  sheetFormat: { banding: null, align: {} }, allowCsvDownload: false,
  summary: "",
  content: "# Plan",
  kind: "markdown",
  language: "",
  project: null, tags: [],
  sessionId: "",
  source: "",
  files: [],
  updatedBy: { id: "member", kind: "person", handle: "ann", name: "Ann" },
  visibility: "team",
  comments: "team",
  showInSearch: false,
  teamId: "team-1",
  authorId: "author",
  originalAuthorId: null,
  pendingSharing: { requestId: "r1", level: "public", teamId: "team-1", comments: "signed_in", requestedAt: "2026-11-05T00:00:00.000Z" },
  pendingEdit: null,
  pendingComments: null, harness: null,
  metadata: {},
  createdAt: "2026-11-05T00:00:00.000Z",
  updatedAt: "2026-11-05T00:00:00.000Z",
};

const context = (viewerId: string, slugs: [string, string][] = [["team-1", "platform"]]) => ({
  viewerId,
  teamSlugs: new Map(slugs),
  urlFor: (publicId: string) => `https://artifacts.space/artifact/${publicId}`,
});

/** A connection that may edit the artifact. */
const editor = { canEdit: true };

describe("toMcpArtifact", () => {
  it("should expose the public id and URL, never the internal id", () => {
    const view = toMcpArtifact(dto, context("author"), editor);
    expect(view.id).toBe(dto.publicId);
    expect(view.url).toBe(`https://artifacts.space/artifact/${dto.publicId}`);
    expect(JSON.stringify(view)).not.toContain("internal-uuid");
  });

  it("should show the pending request only to the author", () => {
    expect(toMcpArtifact(dto, context("author"), editor).pendingSharing).toEqual({ visibility: "public", team: "platform", comments: "signed_in", requestedAt: dto.createdAt });
    expect(toMcpArtifact(dto, context("member"), editor).pendingSharing).toBeNull();
  });

  it("should hide the team slug when the caller is not in the team", () => {
    expect(toMcpArtifact(dto, context("member"), editor).team).toBe("platform");
    expect(toMcpArtifact(dto, context("outsider", []), editor).team).toBeNull();
  });

  it("should give a preview and no content when the artifact is listed", () => {
    // Even when a full artifact is passed by mistake, its content is never copied.
    const item = toMcpListItem({ ...dto, preview: "# Pl" }, context("author"));
    expect(item.content).toBeUndefined();
    expect(item.preview).toBe("# Pl");
  });

  it("should return the icon when the artifact is read or listed", () => {
    expect(toMcpArtifact(dto, context("author"), editor).icon).toBe("🧭");
    expect(toMcpListItem({ ...dto, icon: null, preview: "" }, context("author")).icon).toBeNull();
  });

  it("should name who saved it last by handle", () => {
    expect(toMcpArtifact(dto, context("member"), editor).updatedBy).toBe("@ann");
    expect(toMcpArtifact({ ...dto, updatedBy: null }, context("member"), editor).updatedBy).toBeNull();
  });
});

describe("toMcpArtifact for a CSV whose owner turned downloads off", () => {
  const sheet = { ...dto, kind: "csv" as const, content: "name,secret\nalpha,s3cr3t-row\n", allowCsvDownload: false };

  it("should leave the content out for a non-member's connection, with a note", () => {
    const view = toMcpArtifact(sheet, context("outsider", []), { canEdit: false });
    expect(view.content).toBe("");
    expect(view.contentWithheld).toContain("turned off downloads");
    expect(JSON.stringify(view)).not.toContain("s3cr3t-row");
    expect(view.allowCsvDownload).toBe(false);
    expect(view.files, "attached files are outside the rule, as in artifacts_list").toEqual(toMcpArtifact(sheet, context("member"), editor).files);
  });

  it("should give a team member's or the author's connection the content", () => {
    expect(toMcpArtifact(sheet, context("member"), editor).content).toContain("s3cr3t-row");
    expect(toMcpArtifact(sheet, context("author"), editor).contentWithheld).toBeUndefined();
  });

  it("should give every connection the content when downloads are on", () => {
    expect(toMcpArtifact({ ...sheet, allowCsvDownload: true }, context("outsider", []), { canEdit: false }).content).toContain("s3cr3t-row");
  });
});
