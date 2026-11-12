import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserFacingError } from "@/lib/user-facing-error";

import { QUOTE_MAX_LENGTH } from "./anchor-rules";
import type { Thread } from "./thread";

const access = vi.hoisted(() => ({ getViewableArtifact: vi.fn() }));
vi.mock("@/lib/access", () => access);

const { anchorToStore, assertTopLevelAnchor, QUOTE_NOT_FOUND_MESSAGE } = await import("./anchor-input");

const thread = {
  actor: { kind: "agent", userId: "agent-1" },
  artifact: { publicId: "a".repeat(22) },
} as unknown as Thread;

describe("assertTopLevelAnchor", () => {
  it("should refuse words when the comment is a reply", () => {
    expect(() => {
      assertTopLevelAnchor({ parentId: "c1", anchor: { quote: "x", prefix: "", suffix: "" } });
    }).toThrow(UserFacingError);
    expect(() => {
      assertTopLevelAnchor({ parentId: "c1", quote: "x" });
    }).toThrow(/reply cannot be made on words/);
  });

  it("should allow words when the comment is top-level, and a plain reply", () => {
    expect(() => {
      assertTopLevelAnchor({ anchor: { quote: "x", prefix: "", suffix: "" } });
    }).not.toThrow();
    expect(() => {
      assertTopLevelAnchor({ parentId: "c1" });
    }).not.toThrow();
  });
});

describe("anchorToStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should store a person's selection without checking the saved content when it has not been saved yet", async () => {
    const anchor = await anchorToStore(thread, { anchor: { quote: "  words just\ntyped ", prefix: "before", suffix: "after" } });
    expect(anchor).toEqual({ quote: "words just typed", prefix: "before", suffix: "after" });
    expect(access.getViewableArtifact).not.toHaveBeenCalled();
  });

  it("should cut a long selection to the stored length when a person selects a lot", async () => {
    const anchor = await anchorToStore(thread, { anchor: { quote: "w".repeat(QUOTE_MAX_LENGTH * 3), prefix: "", suffix: "" } });
    expect(anchor?.quote).toHaveLength(QUOTE_MAX_LENGTH);
  });

  it("should reject a selection when it is not text", async () => {
    await expect(anchorToStore(thread, { anchor: { quote: 42, prefix: "", suffix: "" } as unknown as { quote: string; prefix: string; suffix: string } })).rejects.toThrow();
  });

  it("should save no place when the selection holds no words", async () => {
    expect(await anchorToStore(thread, { anchor: { quote: "  \n ", prefix: "", suffix: "" } })).toBeNull();
  });

  it("should anchor an agent's quote in the content it is served", async () => {
    access.getViewableArtifact.mockResolvedValue({ view: { content: "We ship the **beta** on Monday." } });
    expect(await anchorToStore(thread, { quote: "the beta on" })).toEqual({ quote: "the beta on", prefix: "We ship", suffix: "Monday." });
    expect(access.getViewableArtifact).toHaveBeenCalledWith(thread.artifact.publicId, "agent-1");
  });

  it("should refuse an agent's quote when the words are not in the content it is served", async () => {
    access.getViewableArtifact.mockResolvedValue({ view: { content: "We ship the beta on Monday." } });
    await expect(anchorToStore(thread, { quote: "acquire Northwind" })).rejects.toThrow(QUOTE_NOT_FOUND_MESSAGE);
  });

  it("should store nothing when neither words nor a quote are given", async () => {
    expect(await anchorToStore(thread, {})).toBeNull();
  });
});
