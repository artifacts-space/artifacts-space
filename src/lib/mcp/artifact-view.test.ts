import { describe, expect, it } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";

import { toMcpArtifact } from "./artifact-view";

const dto: ArtifactDto = {
  id: "internal-uuid",
  publicId: "4fXkP9qR2sT7vW1yZ3aB5c",
  title: "Plan",
  summary: "",
  content: "# Plan",
  kind: "markdown",
  language: "",
  project: "",
  sessionId: "",
  source: "",
  files: [],
  visibility: "team",
  teamId: "team-1",
  authorId: "author",
  originalAuthorId: null,
  pendingSharing: { requestId: "r1", level: "public", teamId: "team-1", requestedAt: "2026-11-05T00:00:00.000Z" },
  pendingEdit: null,
  metadata: {},
  createdAt: "2026-11-05T00:00:00.000Z",
  updatedAt: "2026-11-05T00:00:00.000Z",
};

const context = (viewerId: string, slugs: [string, string][] = [["team-1", "platform"]]) => ({
  viewerId,
  teamSlugs: new Map(slugs),
  urlFor: (publicId: string) => `https://artifacts.space/artifact/${publicId}`,
});

describe("toMcpArtifact", () => {
  it("should expose the public id and URL, never the internal id", () => {
    const view = toMcpArtifact(dto, context("author"));
    expect(view.id).toBe(dto.publicId);
    expect(view.url).toBe(`https://artifacts.space/artifact/${dto.publicId}`);
    expect(JSON.stringify(view)).not.toContain("internal-uuid");
  });

  it("should show the pending request only to the author", () => {
    expect(toMcpArtifact(dto, context("author")).pendingSharing).toEqual({ visibility: "public", team: "platform", requestedAt: dto.createdAt });
    expect(toMcpArtifact(dto, context("member")).pendingSharing).toBeNull();
  });

  it("should hide the team slug when the caller is not in the team", () => {
    expect(toMcpArtifact(dto, context("member")).team).toBe("platform");
    expect(toMcpArtifact(dto, context("outsider", [])).team).toBeNull();
  });

  it("should leave out content when a compact view is asked for", () => {
    expect(toMcpArtifact(dto, context("author"), false).content).toBeUndefined();
  });
});
