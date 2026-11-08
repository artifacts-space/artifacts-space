import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Who may change "Show in search engines": the people who may share the
 * artifact (its author, or the person who added the agent that wrote it), as
 * a person in the web app. Teammates, team owners and admins, strangers, and
 * agents are refused before anything is written.
 */

const mocks = vi.hoisted(() => ({
  row: null as { userId: string; visibility: string } | null,
  updated: [] as unknown[],
  set: vi.fn(),
  enforceRateLimit: vi.fn(),
  dtoFor: vi.fn(),
  actsForAuthor: vi.fn(),
}));

function selectChain() {
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "from", "where"]) builder[name] = () => builder;
  builder.limit = () => Promise.resolve(mocks.row ? [mocks.row] : []);
  return builder;
}

function updateChain() {
  const builder: Record<string, unknown> = {};
  builder.set = (values: unknown) => {
    mocks.set(values);
    return builder;
  };
  builder.where = () => builder;
  builder.returning = () => Promise.resolve(mocks.updated);
  return builder;
}

vi.mock("@/db", () => ({ getDb: () => ({ select: () => selectChain(), update: () => updateChain() }) }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/sharing/requests", () => ({ dtoFor: mocks.dtoFor }));
vi.mock("@/lib/agents/owner-access", () => ({ actsForAuthor: mocks.actsForAuthor }));

const { setShowInSearch } = await import("./search-service");

const author = "author-1";

describe("setShowInSearch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.row = { userId: author, visibility: "public" };
    mocks.updated = [{ id: "art-1" }];
    mocks.enforceRateLimit.mockResolvedValue(undefined);
    mocks.dtoFor.mockResolvedValue({ id: "art-1", showInSearch: true });
    mocks.actsForAuthor.mockResolvedValue(false);
  });

  it("should turn it on when the author asks for a public artifact", async () => {
    await expect(setShowInSearch({ actorId: author, artifactId: "art-1", on: true, actor: "person" })).resolves.toEqual({ id: "art-1", showInSearch: true });
    expect(mocks.set).toHaveBeenCalledWith({ showInSearch: true });
  });

  it("should refuse and write nothing when someone other than the author asks", async () => {
    for (const actorId of ["teammate", "team-admin", "stranger"]) {
      await expect(setShowInSearch({ actorId, artifactId: "art-1", on: true, actor: "person" })).rejects.toThrow(/Only the people who can share it/);
      await expect(setShowInSearch({ actorId, artifactId: "art-1", on: false, actor: "person" })).rejects.toThrow(/Only the people who can share it/);
    }
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("should let the person who added the agent turn it on when an agent wrote the artifact", async () => {
    mocks.row = { userId: "agent-1", visibility: "public" };
    mocks.actsForAuthor.mockResolvedValue(true);
    await setShowInSearch({ actorId: "agent-owner", artifactId: "art-1", on: true, actor: "person" });
    expect(mocks.actsForAuthor).toHaveBeenCalledWith("agent-owner", "agent-1");
    expect(mocks.set).toHaveBeenCalledWith({ showInSearch: true });
  });

  it("should refuse and write nothing when anyone but the agent's adder asks about an agent's artifact", async () => {
    // actsForAuthor (src/lib/agents/owner-access.ts) is true only for the person who added the agent while they
    // are still in its team; owner-access.test.ts checks that join. Here it answers false, as it does for each of these.
    mocks.row = { userId: "agent-1", visibility: "public" };
    for (const actorId of ["teammate", "team-admin", "team-owner", "stranger", "departed-adder"]) {
      await expect(setShowInSearch({ actorId, artifactId: "art-1", on: true, actor: "person" })).rejects.toThrow(/Only the people who can share it/);
      await expect(setShowInSearch({ actorId, artifactId: "art-1", on: false, actor: "person" })).rejects.toThrow(/Only the people who can share it/);
      expect(mocks.actsForAuthor).toHaveBeenCalledWith(actorId, "agent-1");
    }
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("should refuse the adder and write nothing when they have left the agent's team", async () => {
    mocks.row = { userId: "agent-1", visibility: "public" };
    const stillInTeam = new Set(["adder"]);
    mocks.actsForAuthor.mockImplementation((viewerId: string, authorId: string) => Promise.resolve(viewerId === "adder" && authorId === "agent-1" && stillInTeam.has(viewerId)));
    await setShowInSearch({ actorId: "adder", artifactId: "art-1", on: true, actor: "person" });
    expect(mocks.set).toHaveBeenCalledTimes(1);

    stillInTeam.delete("adder");
    await expect(setShowInSearch({ actorId: "adder", artifactId: "art-1", on: false, actor: "person" })).rejects.toThrow(/Only the people who can share it/);
    expect(mocks.set).toHaveBeenCalledTimes(1);
  });

  it("should refuse and write nothing when the agent itself asks for its own artifact", async () => {
    mocks.row = { userId: "agent-1", visibility: "public" };
    await expect(setShowInSearch({ actorId: "agent-1", artifactId: "art-1", on: true, actor: "agent" })).rejects.toThrow(/Only the people who can share it/);
    await expect(setShowInSearch({ actorId: "agent-owner", artifactId: "art-1", on: true, actor: "agent" })).rejects.toThrow(/Only the people who can share it/);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("should refuse and write nothing when an agent asks, even for its own artifact", async () => {
    await expect(setShowInSearch({ actorId: author, artifactId: "art-1", on: true, actor: "agent" })).rejects.toThrow(/Only the people who can share it/);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("should refuse to turn it on when the artifact is not public", async () => {
    for (const visibility of ["private", "team", "link"]) {
      mocks.row = { userId: author, visibility };
      await expect(setShowInSearch({ actorId: author, artifactId: "art-1", on: true, actor: "person" })).rejects.toThrow(/public/);
    }
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("should answer not found when the artifact does not exist", async () => {
    mocks.row = null;
    await expect(setShowInSearch({ actorId: author, artifactId: "missing", on: true, actor: "person" })).rejects.toThrow(/not found/);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("should report a change of visibility when the artifact stopped being public during the save", async () => {
    mocks.updated = [];
    await expect(setShowInSearch({ actorId: author, artifactId: "art-1", on: true, actor: "person" })).rejects.toThrow(/no longer public/);
  });

  it("should let the author turn it off when the artifact is not public anymore", async () => {
    mocks.row = { userId: author, visibility: "link" };
    await setShowInSearch({ actorId: author, artifactId: "art-1", on: false, actor: "person" });
    expect(mocks.set).toHaveBeenCalledWith({ showInSearch: false });
  });
});
