import { describe, expect, it } from "vitest";

import type { MentionDirectory } from "@/lib/comments/mention-autocomplete";

import { mentionListView, takeMentionAnswer, type MentionListLoaded } from "./mention-list-load";

const self = { userId: "viewer", handle: "viewer", name: "Viewer", kind: "person" as const };
const nobody: MentionDirectory = { candidates: [], self };
const team: MentionDirectory = { candidates: [{ userId: "leah", handle: "leah", name: "Leah Park", kind: "person" }], self };

/** The state after these answers, in order, as the provider takes them in. */
function answered(...answers: Parameters<typeof takeMentionAnswer>[1][]): MentionListLoaded | null {
  return answers.reduce<MentionListLoaded | null>((loaded, answer) => takeMentionAnswer(loaded, answer), null);
}

describe("mentionListView", () => {
  it("should say loading, and offer nobody, when the first request has not answered", () => {
    expect(mentionListView(null, "doc", 0)).toEqual({ directory: { candidates: [], self: null }, list: "loading", failed: null });
  });

  it("should be ready with the list when the newest request answered with it", () => {
    const view = mentionListView(answered({ publicId: "doc", ask: 0, directory: nobody }), "doc", 0);

    expect(view.list).toBe("ready");
    expect(view.directory).toBe(nobody);
  });

  it("should keep the list in hand and say loading when a newer request is on its way", () => {
    const view = mentionListView(answered({ publicId: "doc", ask: 0, directory: team }), "doc", 1);

    expect(view.list).toBe("loading");
    expect(view.directory).toBe(team);
    expect(view.failed).toBeNull();
  });

  it("should say unavailable, and not that nobody can be mentioned, when the first request failed", () => {
    const loaded = answered({ publicId: "doc", ask: 0, directory: null });
    const view = mentionListView(loaded, "doc", 0);

    expect(view.list).toBe("unavailable");
    expect(view.directory.candidates).toEqual([]);
    expect(view.failed).toBe(loaded?.last);
  });

  it("should keep the list in hand and say unavailable when a reload failed", () => {
    const view = mentionListView(answered({ publicId: "doc", ask: 0, directory: team }, { publicId: "doc", ask: 1, directory: null }), "doc", 1);

    expect(view.list).toBe("unavailable");
    expect(view.directory).toBe(team);
  });

  it("should be ready with the new list when a request after a failure answered", () => {
    const loaded = answered({ publicId: "doc", ask: 0, directory: null }, { publicId: "doc", ask: 1, directory: team });

    expect(mentionListView(loaded, "doc", 1)).toEqual({ directory: team, list: "ready", failed: null });
  });

  it("should give a new failure its own answer, so each one waits for its own retry", () => {
    const first = answered({ publicId: "doc", ask: 0, directory: null });
    const second = takeMentionAnswer(first, { publicId: "doc", ask: 1, directory: null });

    expect(mentionListView(second, "doc", 1).failed).not.toBe(mentionListView(first, "doc", 0).failed);
  });

  it("should never offer another artifact's list when the thread moved to another artifact", () => {
    const view = mentionListView(answered({ publicId: "doc", ask: 0, directory: team }), "other", 0);

    expect(view.list).toBe("loading");
    expect(view.directory.candidates).toEqual([]);
  });

  it("should not keep another artifact's list when the answer for this one failed", () => {
    const view = mentionListView(answered({ publicId: "doc", ask: 0, directory: team }, { publicId: "other", ask: 0, directory: null }), "other", 0);

    expect(view.list).toBe("unavailable");
    expect(view.directory.candidates).toEqual([]);
  });
});
