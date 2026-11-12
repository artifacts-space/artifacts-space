import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommentView } from "./views";

const access = vi.hoisted(() => ({ getArtifactAccess: vi.fn(), getViewableArtifact: vi.fn() }));
vi.mock("@/lib/access", () => access);

const { anchorGateFor, servedAnchors, textChangedCheck } = await import("./served-anchors");

const publicId = "a".repeat(22);
const anchored = { quote: "acquire Northwind", parentId: null, deletedAt: null };
const stored = { quote: "acquire Northwind", prefix: "we will", suffix: "soon" };

function served(content: string, source: "latest" | "approved" = "approved") {
  return { version: { source, versionId: source === "approved" ? "v1" : null }, view: { content } };
}

describe("anchorGateFor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should load no content when the viewer is served the latest version", async () => {
    const gate = await anchorGateFor({ publicId, viewerId: "u1", records: [anchored], source: "latest" });
    expect(gate(stored)).toEqual(stored);
    expect(access.getViewableArtifact).not.toHaveBeenCalled();
  });

  it("should load no content when no comment is anchored", async () => {
    const gate = await anchorGateFor({ publicId, viewerId: "u1", records: [{ ...anchored, quote: null }], source: "approved" });
    expect(gate(stored)).toBeNull();
    expect(access.getViewableArtifact).not.toHaveBeenCalled();
    expect(access.getArtifactAccess).not.toHaveBeenCalled();
  });

  it("should withhold the quote when the approved version the viewer reads lacks the words", async () => {
    access.getViewableArtifact.mockResolvedValue(served("We ship the beta on Monday."));
    const gate = await anchorGateFor({ publicId, viewerId: "outsider", records: [anchored], source: "approved" });
    expect(gate(stored)).toBeNull();
    expect(gate({ quote: "the beta", prefix: "", suffix: "" })).toEqual({ quote: "the beta", prefix: "We ship", suffix: "on Monday." });
  });

  it("should check the access itself when the caller does not know the served version", async () => {
    access.getArtifactAccess.mockResolvedValue({ version: { source: "approved", versionId: "v1" } });
    access.getViewableArtifact.mockResolvedValue(served("Nothing to see."));
    const gate = await anchorGateFor({ publicId, viewerId: "outsider", records: [anchored] });
    expect(gate(stored)).toBeNull();
  });

  it("should hide every anchor when the viewer may no longer read the artifact", async () => {
    access.getArtifactAccess.mockResolvedValue(null);
    expect((await anchorGateFor({ publicId, viewerId: "outsider", records: [anchored] }))(stored)).toBeNull();
  });

  it("should hide every anchor when loading the served content fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    access.getViewableArtifact.mockRejectedValue(new Error("connection reset"));
    expect((await anchorGateFor({ publicId, viewerId: "outsider", records: [anchored], source: "approved" }))(stored)).toBeNull();
  });
});

describe("textChangedCheck", () => {
  const view: Pick<CommentView, "anchored" | "anchor"> = { anchored: true, anchor: stored };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should flag a quote whose words left the content the agent reads", async () => {
    access.getViewableArtifact.mockResolvedValue(served("We changed plans.", "latest"));
    const changed = await textChangedCheck(publicId, "agent", [view]);
    expect(changed(view)).toBe(true);
  });

  it("should not flag a quote whose words are still there", async () => {
    access.getViewableArtifact.mockResolvedValue(served("Then we will acquire Northwind soon.", "latest"));
    const changed = await textChangedCheck(publicId, "agent", [view]);
    expect(changed(view)).toBe(false);
  });

  it("should load nothing and flag withheld quotes when no quote is shown", async () => {
    const withheld = { anchored: true, anchor: null };
    const changed = await textChangedCheck(publicId, "agent", [withheld]);
    expect(changed(withheld)).toBe(true);
    expect(access.getViewableArtifact).not.toHaveBeenCalled();
  });
});

describe("servedAnchors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should load an artifact's served content once when one request gates and checks its comments several times", async () => {
    // Fails if the inbox reads the whole artifact again for every mention on it.
    access.getViewableArtifact.mockResolvedValue(served("We ship the beta on Monday."));
    const shared = servedAnchors("outsider");
    const beta = { quote: "the beta", prefix: "", suffix: "" };

    const gates = await Promise.all([1, 2, 3].map(() => anchorGateFor({ publicId, viewerId: "outsider", records: [anchored], source: "approved", served: shared })));
    const checks = await Promise.all([1, 2, 3].map(() => textChangedCheck(publicId, "outsider", [{ anchored: true, anchor: beta }], shared)));

    expect(gates.map((gate) => gate(beta)?.quote)).toEqual(["the beta", "the beta", "the beta"]);
    expect(checks.map((changed) => changed({ anchored: true, anchor: beta }))).toEqual([false, false, false]);
    expect(access.getViewableArtifact).toHaveBeenCalledTimes(1);
  });

  it("should load each artifact by itself when one request reads two", async () => {
    access.getViewableArtifact.mockImplementation((id: string) => Promise.resolve(served(id === publicId ? "We ship the beta." : "Nothing here.")));
    const shared = servedAnchors("outsider");
    const beta = { quote: "the beta", prefix: "", suffix: "" };
    const first = await anchorGateFor({ publicId, viewerId: "outsider", records: [anchored], source: "approved", served: shared });
    const second = await anchorGateFor({ publicId: "b".repeat(22), viewerId: "outsider", records: [anchored], source: "approved", served: shared });
    expect(first(beta)).not.toBeNull();
    expect(second(beta)).toBeNull();
  });
});
