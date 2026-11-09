import { describe, expect, it } from "vitest";

import { defaultActor } from "@/lib/teams/capability-rules";

import { canChangeCsvDownload, type CsvDownloadActor, csvFileName, mayExportCsv } from "./rules";

const sheetOff = { kind: "csv", allowCsvDownload: false } as const;
const sheetOn = { kind: "csv", allowCsvDownload: true } as const;

describe("mayExportCsv", () => {
  it.each([
    ["a signed-out link reader"],
    ["a public reader"],
    ["a non-member's MCP connection"],
    ["a team member who may only read"],
  ])("should refuse %s when downloads are off", () => {
    expect(mayExportCsv({ canEdit: false }, sheetOff)).toBe(false);
  });

  it("should allow an editor (the author, a teammate, or their agent) when downloads are off", () => {
    expect(mayExportCsv({ canEdit: true }, sheetOff)).toBe(true);
  });

  it("should allow every reader when downloads are on", () => {
    expect(mayExportCsv({ canEdit: false }, sheetOn)).toBe(true);
  });

  it("should never limit artifacts that are not CSV", () => {
    expect(mayExportCsv({ canEdit: false }, { kind: "markdown", allowCsvDownload: false })).toBe(true);
  });
});

describe("canChangeCsvDownload", () => {
  const base: CsvDownloadActor = { actorId: "author", authorId: "author", actsForAuthor: false, member: null, teamPersonal: false, actor: "person" };

  it("should let the author change it", () => {
    expect(canChangeCsvDownload(base)).toBe(true);
  });

  it("should let the person who added the agent that wrote it change it", () => {
    expect(canChangeCsvDownload({ ...base, actorId: "adder", authorId: "agent-user", actsForAuthor: true })).toBe(true);
  });

  it.each([["owner"], ["admin"]] as const)("should let a team %s change it", (role) => {
    expect(canChangeCsvDownload({ ...base, actorId: "lead", member: defaultActor(role) })).toBe(true);
  });

  it("should refuse a team member who may only edit", () => {
    expect(canChangeCsvDownload({ ...base, actorId: "teammate", member: defaultActor("member") })).toBe(false);
  });

  it("should refuse a stranger", () => {
    expect(canChangeCsvDownload({ ...base, actorId: "stranger" })).toBe(false);
  });

  it("should refuse an agent, even the agent that wrote it", () => {
    expect(canChangeCsvDownload({ ...base, actor: "agent" })).toBe(false);
    expect(canChangeCsvDownload({ ...base, actorId: "lead", member: defaultActor("owner"), actor: "agent" })).toBe(false);
    expect(canChangeCsvDownload({ ...base, actorId: "adder", authorId: "agent-user", actsForAuthor: true, actor: "agent" })).toBe(false);
  });

  it("should refuse an owner of a personal team who is not the author", () => {
    expect(canChangeCsvDownload({ ...base, actorId: "lead", member: defaultActor("owner"), teamPersonal: true })).toBe(false);
  });
});

describe("csvFileName", () => {
  it("should name the download after the title without characters file systems refuse", () => {
    expect(csvFileName('Q3: spend / "plan"')).toBe("Q3 spend plan.csv");
    expect(csvFileName("  ")).toBe("sheet.csv");
  });
});
