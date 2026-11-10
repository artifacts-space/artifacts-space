import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultActor } from "@/lib/teams/capability-rules";

/*
 * Who may turn "Allow CSV download" on: the author (or the person who added
 * the agent that wrote it) and the owners and admins of the artifact's
 * shared team, as people in the web app. Members who may only edit,
 * strangers, and agents (even the agent that wrote it) are refused before
 * anything is written. Every call counts against the rate limit first. The
 * write's own permission re-check is SQL: write-condition.test.ts reads it,
 * and store.db.test.ts runs it against a real database.
 */

const mocks = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  updated: [] as unknown[],
  steps: [] as string[],
  set: vi.fn(),
  where: vi.fn(),
  writeCondition: vi.fn(),
  enforceRateLimit: vi.fn(),
  actsForAuthor: vi.fn(),
  membership: vi.fn(),
}));

function selectChain() {
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "from", "where"]) builder[name] = () => builder;
  // The artifact row and the team row come from the same stand-in row.
  builder.limit = () => {
    mocks.steps.push("read");
    return Promise.resolve(mocks.row ? [mocks.row] : []);
  };
  return builder;
}

function updateChain() {
  const builder: Record<string, unknown> = {};
  builder.set = (values: unknown) => {
    mocks.set(values);
    return builder;
  };
  builder.where = (condition: unknown) => {
    mocks.where(condition);
    return builder;
  };
  builder.returning = () => {
    mocks.steps.push("write");
    return Promise.resolve(mocks.updated);
  };
  return builder;
}

const writeConditionSentinel = { sql: "the write's own permission check" };

vi.mock("@/db", () => ({ getDb: () => ({ select: () => selectChain(), update: () => updateChain() }) }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/agents/owner-access", () => ({ actsForAuthor: mocks.actsForAuthor }));
vi.mock("@/lib/teams/queries", () => ({ getTeamMembershipById: mocks.membership }));
vi.mock("./write-condition", () => ({ csvDownloadWriteCondition: mocks.writeCondition }));

const { canChangeCsvDownloadFor, setCsvDownload } = await import("./store");

const author = "author-1";
const turnOn = (actorId: string, actor: "person" | "agent" = "person") => setCsvDownload({ actorId, artifactId: "art-1", on: true, actor });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.steps = [];
  mocks.row = { userId: author, teamId: "team-1", kind: "csv", publicId: "pub-1", personal: false };
  mocks.updated = [{ publicId: "pub-1", allowCsvDownload: true }];
  mocks.enforceRateLimit.mockImplementation(() => {
    mocks.steps.push("rate limit");
    return Promise.resolve(undefined);
  });
  mocks.writeCondition.mockReturnValue(writeConditionSentinel);
  mocks.actsForAuthor.mockResolvedValue(false);
  mocks.membership.mockResolvedValue(null);
});

describe("setCsvDownload", () => {
  it("should turn downloads on when the author asks", async () => {
    await expect(turnOn(author)).resolves.toEqual({ publicId: "pub-1", allowCsvDownload: true });
    expect(mocks.set).toHaveBeenCalledWith({ allowCsvDownload: true });
  });

  it("should turn downloads on when the person who added the writing agent asks", async () => {
    mocks.row = { ...mocks.row, userId: "agent-user" };
    mocks.actsForAuthor.mockResolvedValue(true);
    await expect(turnOn("adder")).resolves.toMatchObject({ allowCsvDownload: true });
  });

  it.each([["owner"], ["admin"]] as const)("should turn downloads on when a team %s asks", async (role) => {
    mocks.membership.mockResolvedValue({ ...defaultActor(role), personal: false });
    await expect(turnOn("lead")).resolves.toMatchObject({ allowCsvDownload: true });
  });

  it("should look nothing up beyond the artifact when the author asks", async () => {
    await expect(turnOn(author)).resolves.toMatchObject({ allowCsvDownload: true });
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(mocks.actsForAuthor).not.toHaveBeenCalled();
  });

  it("should write only where the permission is checked again against the author and team it read", async () => {
    mocks.membership.mockResolvedValue({ ...defaultActor("admin"), personal: false });
    await expect(turnOn("lead")).resolves.toMatchObject({ allowCsvDownload: true });
    expect(mocks.writeCondition.mock.calls[0]?.[1]).toMatchObject({ actorId: "lead", artifactId: "art-1", record: { userId: author, teamId: "team-1" } });
    expect(mocks.where).toHaveBeenCalledWith(writeConditionSentinel);
  });

  it("should refuse a team admin when the write's own check no longer matches, as after a downgrade or a team move", async () => {
    mocks.membership.mockResolvedValue({ ...defaultActor("admin"), personal: false });
    mocks.updated = [];
    await expect(turnOn("lead")).rejects.toThrow("Artifact not found");
  });

  it.each([
    ["a team member who may only edit", "teammate", () => { mocks.membership.mockResolvedValue({ ...defaultActor("member"), personal: false }); }],
    ["a stranger", "stranger", () => undefined],
    ["a team owner when the team is personal", "lead", () => { mocks.membership.mockResolvedValue({ ...defaultActor("owner"), personal: true }); }],
  ])("should refuse %s, write nothing, and still count the call against the rate limit", async (_who, actorId, arrange) => {
    arrange();
    await expect(turnOn(actorId)).rejects.toThrow("Artifact not found");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("artifactUpdate", actorId);
  });

  it("should refuse an agent trying to flip the setting, even the agent that wrote it or an owner's agent", async () => {
    await expect(turnOn(author, "agent")).rejects.toThrow("Artifact not found");
    mocks.membership.mockResolvedValue(defaultActor("owner"));
    await expect(turnOn("lead", "agent")).rejects.toThrow("Artifact not found");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(2);
  });

  it("should refuse an artifact that is not a CSV and count it against the rate limit", async () => {
    mocks.row = { ...mocks.row, kind: "markdown" };
    await expect(turnOn(author)).rejects.toThrow("Artifact not found");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("artifactUpdate", author);
  });

  it("should count the call before it reads anything when the author asks", async () => {
    await expect(turnOn(author)).resolves.toMatchObject({ allowCsvDownload: true });
    expect(mocks.steps).toEqual(["rate limit", "read", "write"]);
  });

  it("should read and write nothing when the rate limit is reached", async () => {
    mocks.enforceRateLimit.mockRejectedValue(new Error("You have changed artifacts a lot in the last hour."));
    await expect(turnOn("stranger")).rejects.toThrow("a lot in the last hour");
    expect(mocks.steps).toEqual([]);
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("should answer not found when the author changed while the request ran", async () => {
    mocks.updated = [];
    await expect(turnOn(author)).rejects.toThrow("Artifact not found");
  });
});

describe("canChangeCsvDownloadFor", () => {
  it("should show the control only to someone who may change it", async () => {
    const record = { userId: author, teamId: "team-1", kind: "csv" };
    await expect(canChangeCsvDownloadFor(author, record)).resolves.toBe(true);
    await expect(canChangeCsvDownloadFor("stranger", record)).resolves.toBe(false);
    await expect(canChangeCsvDownloadFor(null, record)).resolves.toBe(false);
    await expect(canChangeCsvDownloadFor(author, { ...record, kind: "markdown" })).resolves.toBe(false);
  });
});
