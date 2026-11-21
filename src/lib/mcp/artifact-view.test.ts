import { describe, expect, it } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";

import type { McpActor } from "./actors";
import { artifactActorIds, toMcpArtifact, toMcpList, toMcpListItem, type McpViewContext } from "./artifact-view";

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

const people: [string, McpActor][] = [
  ["author", { handle: "lee", kind: "person", name: { untrustedText: "Lee" } }],
  ["member", { handle: "ann", kind: "person", name: { untrustedText: "Ann" } }],
  ["first", { handle: "old-hand", kind: "person" }],
];

const context = (viewerId: string, teams: [string, { slug: string; personal: boolean }][] = [["team-1", { slug: "platform", personal: false }]]): McpViewContext => ({
  viewerId,
  teams: new Map(teams),
  urlFor: (publicId: string) => `https://artifacts.space/artifact/${publicId}`,
  actors: new Map(people),
});

/** A connection that may edit the artifact. */
const editor = { canEdit: true };
const reader = { canEdit: false };

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

  it("should name the author and who saved it last as actors, and null when they are gone", () => {
    const view = toMcpArtifact(dto, context("member"), editor);
    expect(view.author).toEqual({ handle: "lee", kind: "person", name: { untrustedText: "Lee" } });
    expect(view.updatedBy).toEqual({ handle: "ann", kind: "person", name: { untrustedText: "Ann" } });
    expect(toMcpArtifact({ ...dto, updatedBy: null }, context("member"), editor).updatedBy).toBeNull();
    expect(toMcpArtifact({ ...dto, authorId: "gone" }, context("member"), editor).author).toBeNull();
  });

  it("should name people by handle and kind alone in a list, where the same people come back on many rows", () => {
    const item = toMcpListItem({ ...dto, preview: "" }, context("member"));
    expect(item.author).toEqual({ handle: "lee", kind: "person" });
    expect(item.updatedBy).toEqual({ handle: "ann", kind: "person" });
  });

  it("should give a list each person its rows name once, in full, and never a first author a reader's row leaves out", () => {
    const handedOver = { ...dto, originalAuthorId: "first", visibility: "public" as const, preview: "" };
    expect(toMcpList([handedOver], context("member")).people).toEqual({ lee: { kind: "person", name: { untrustedText: "Lee" } }, ann: { kind: "person", name: { untrustedText: "Ann" } }, "old-hand": { kind: "person" } });
    expect(toMcpList([handedOver], context("outsider", [])).people).not.toHaveProperty("old-hand");
  });

  it("should ask for the author, the first author, and the saver when it lists whose actors to load", () => {
    expect(artifactActorIds([{ ...dto, originalAuthorId: "first" }])).toEqual(["author", "first", "member"]);
    expect(artifactActorIds([{ ...dto, updatedBy: null }])).toEqual(["author"]);
  });
});

describe("what the caller may do with an artifact", () => {
  it("should let the author edit, share, comment, and delete, and say its home is the team when it is shared through one", () => {
    const view = toMcpArtifact(dto, context("author"), editor);
    expect(view.can).toEqual(["edit", "share", "comment", "delete"]);
    expect(view.home).toBe("team");
    expect(view.actsForAuthor).toBeUndefined();
  });

  it("should let a teammate edit and comment, never share or delete", () => {
    const view = toMcpListItem({ ...dto, preview: "" }, context("member"));
    expect(view.can).toEqual(["edit", "comment"]);
    expect(view.home).toBe("team");
  });

  it("should give a reader outside the team of a public artifact no right but reading, and no home", () => {
    const shared = { ...dto, visibility: "public" as const, comments: "team" as const };
    const view = toMcpArtifact(shared, context("outsider", []), reader);
    expect(view.can).toEqual([]);
    expect(view).not.toHaveProperty("home");
    expect(toMcpListItem({ ...shared, preview: "" }, context("outsider", [])).can).toEqual([]);
  });

  it("should let a signed-in reader comment when comments are open to anyone signed in, and nothing more", () => {
    const view = toMcpArtifact({ ...dto, visibility: "public", comments: "signed_in" }, context("outsider", []), reader);
    expect(view.can).toEqual(["comment"]);
  });

  it("should follow the access check's edit decision when it made one", () => {
    expect(toMcpArtifact(dto, context("member"), reader).can).toEqual(["comment"]);
  });

  it("should never count a private artifact's team for its comments or edits, even for a member of that team", () => {
    const view = toMcpListItem({ ...dto, visibility: "private", preview: "" }, context("member"));
    expect(view.can).toEqual([]);
  });

  it("should say the person who added the agent acts for its author: they edit, share, and delete it as findDeletableArtifact allows", () => {
    const view = toMcpListItem({ ...dto, authorId: "agent-1", actsForAuthor: true, visibility: "private", preview: "" }, context("owner"));
    expect(view.actsForAuthor).toBe(true);
    // Comments on a private artifact are the author's alone: the agent's, not its owner's.
    expect(view.can).toEqual(["edit", "share", "delete"]);
  });

  it("should put an artifact whose team is the author's personal one, or one the author left, in the Personal workspace", () => {
    expect(toMcpArtifact({ ...dto, visibility: "link" }, context("author", [["team-1", { slug: "me", personal: true }]]), editor).home).toBe("personal");
    expect(toMcpArtifact(dto, context("author", []), editor).home).toBe("personal");
    expect(toMcpArtifact({ ...dto, visibility: "private", teamId: null }, context("author", []), editor).home).toBe("personal");
  });
});

describe("what only editors read on an artifact", () => {
  const handedOver = { ...dto, originalAuthorId: "first", visibility: "public" as const, comments: "signed_in" as const };

  it("should name the first author to editors only when a team owner took it over", () => {
    expect(toMcpArtifact(handedOver, context("member"), editor).firstAuthor).toEqual({ handle: "old-hand", kind: "person" });
    expect(toMcpArtifact(handedOver, context("outsider", []), reader)).not.toHaveProperty("firstAuthor");
    expect(toMcpArtifact(dto, context("member"), editor)).not.toHaveProperty("firstAuthor");
  });

  it("should give the files' editing flags to editors only, and each file's dates and size to everyone", () => {
    const file: FileDto = { id: "f1", filename: "chart.png", contentType: "image/png", size: 10, createdAt: dto.createdAt, replacedAt: "2026-11-06T00:00:00.000Z", width: 800, height: 600, embedded: true, pictured: true };
    const plain: FileDto = { id: "f2", filename: "notes.pdf", contentType: "application/pdf", size: 20, createdAt: dto.createdAt, replacedAt: null };
    const withFiles = { ...handedOver, files: [file, plain] };
    expect(toMcpArtifact(withFiles, context("member"), editor).files).toEqual([
      { id: "f1", filename: "chart.png", contentType: "image/png", size: 10, createdAt: dto.createdAt, replacedAt: "2026-11-06T00:00:00.000Z", width: 800, height: 600, embedded: true, pictured: true },
      { id: "f2", filename: "notes.pdf", contentType: "application/pdf", size: 20, createdAt: dto.createdAt },
    ]);
    const read = toMcpArtifact(withFiles, context("outsider", []), reader).files;
    expect(read[0]).toEqual({ id: "f1", filename: "chart.png", contentType: "image/png", size: 10, createdAt: dto.createdAt, replacedAt: "2026-11-06T00:00:00.000Z", width: 800, height: 600 });
    expect(JSON.stringify(read)).not.toMatch(/embedded|pictured/);
  });

  it("should keep a listed file lean: no dates, sizes in pixels, or flags", () => {
    const file: FileDto = { id: "f1", filename: "chart.png", contentType: "image/png", size: 10, createdAt: dto.createdAt, replacedAt: null, width: 8, height: 6, embedded: true };
    expect(toMcpListItem({ ...dto, files: [file], preview: "" }, context("author")).files).toEqual([{ id: "f1", filename: "chart.png", contentType: "image/png", size: 10 }]);
  });

  it("should show a CSV's formatting when it has some, and nothing for a plain sheet or another format", () => {
    const sheetFormat = { banding: "muted" as const, align: { amount: "right" as const } };
    expect(toMcpArtifact({ ...dto, kind: "csv", sheetFormat }, context("outsider", []), reader).sheetFormat).toEqual(sheetFormat);
    expect(toMcpArtifact({ ...dto, kind: "csv" }, context("author"), editor)).not.toHaveProperty("sheetFormat");
    expect(toMcpArtifact({ ...dto, sheetFormat }, context("author"), editor)).not.toHaveProperty("sheetFormat");
  });
});

describe("toMcpArtifact for a CSV whose owner turned downloads off", () => {
  const sheet = { ...dto, kind: "csv" as const, content: "name,secret\nalpha,s3cr3t-row\n", allowCsvDownload: false };

  it("should leave the content out for a non-member's connection, with a note", () => {
    const view = toMcpArtifact(sheet, context("outsider", []), reader);
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
    expect(toMcpArtifact({ ...sheet, allowCsvDownload: true }, context("outsider", []), reader).content).toContain("s3cr3t-row");
  });
});
