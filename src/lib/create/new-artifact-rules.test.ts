import { describe, expect, it, vi } from "vitest";

import type { ActionResult, ArtifactDto } from "@/lib/artifact-types";

import { BLANK_ARTIFACT_ID, blankDraftProblem, createInputFor, isUntouched, persistOnce, UNTITLED, type BlankDraft } from "./new-artifact-rules";

const blank: BlankDraft = { title: "", icon: null, summary: "", content: "", language: "", kind: "markdown" };
const options = { expectedUpdatedAt: "2026-11-10T00:00:00.000Z", session: "start" as const };

function stored(id: string, updatedAt = "2026-11-10T12:00:00.000Z"): ArtifactDto {
  return { id, updatedAt } as ArtifactDto;
}

/** A create that resolves only when the test says so, to hold it in flight. */
function heldCreate() {
  let release: (result: ActionResult<ArtifactDto>) => void = () => undefined;
  const create = vi.fn(() => new Promise<ActionResult<ArtifactDto>>((resolve) => { release = resolve; }));
  return { create, release: (result: ActionResult<ArtifactDto>) => { release(result); } };
}

describe("isUntouched", () => {
  it("should be untouched when nothing was typed, pasted, picked, or dropped", () => {
    expect(isUntouched(blank)).toBe(true);
    expect(isUntouched({ ...blank, title: "   ", content: "\n" })).toBe(true);
  });

  it("should be touched when a title, content, summary, icon, or file was added", () => {
    expect(isUntouched({ ...blank, title: "Plan" })).toBe(false);
    expect(isUntouched({ ...blank, content: "x" })).toBe(false);
    expect(isUntouched({ ...blank, summary: "One line" })).toBe(false);
    expect(isUntouched({ ...blank, icon: "🚀" })).toBe(false);
    expect(isUntouched(blank, ["file-1"])).toBe(false);
  });
});

describe("blankDraftProblem", () => {
  const strict = (draft: BlankDraft) => (draft.content === "" ? `empty ${draft.kind}` : draft.title === "" ? "no title" : null);

  it("should allow an empty markdown body when only the title was typed", () => {
    expect(blankDraftProblem({ ...blank, title: "Plan" }, strict)).toBeNull();
  });

  it("should not hold content without a title, since the title becomes Untitled", () => {
    expect(blankDraftProblem({ ...blank, content: "x" }, strict)).toBeNull();
  });

  it("should check other formats' content as any save does", () => {
    expect(blankDraftProblem({ ...blank, kind: "json" }, strict)).toBe("empty json");
    expect(blankDraftProblem({ ...blank, kind: "json", content: "{}" }, strict)).toBeNull();
  });
});

describe("createInputFor", () => {
  it("should name the artifact Untitled when the person wrote content but no title", () => {
    expect(createInputFor({ ...blank, title: "  ", content: "x" }, null)).toMatchObject({ title: UNTITLED, content: "x", project: null });
  });

  it("should put the artifact in the filtered project when one is set", () => {
    expect(createInputFor({ ...blank, title: "Plan" }, "Launch").project).toBe("Launch");
  });
});

describe("persistOnce", () => {
  it("should create once when two saves arrive while the create is in flight", async () => {
    const held = heldCreate();
    const update = vi.fn(() => Promise.resolve({ success: true as const, data: stored("a-1", "2026-11-10T12:00:05.000Z") }));
    const save = persistOnce({ current: () => ({ draft: { ...blank, title: "Plan" }, fileIds: [] }), create: held.create, update, project: null });

    const first = save(BLANK_ARTIFACT_ID, { title: "Plan" }, options);
    const second = save(BLANK_ARTIFACT_ID, { title: "Plan B" }, options);
    held.release({ success: true, data: stored("a-1") });

    await expect(first).resolves.toMatchObject({ success: true, data: { id: "a-1" } });
    await expect(second).resolves.toMatchObject({ success: true });
    expect(held.create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("a-1", { title: "Plan B" }, { ...options, expectedUpdatedAt: "2026-11-10T12:00:00.000Z" });
  });

  it("should save to the stored artifact when a later save still names the blank id", async () => {
    const create = vi.fn(() => Promise.resolve({ success: true as const, data: stored("a-1") }));
    const update = vi.fn(() => Promise.resolve({ success: true as const, data: stored("a-1") }));
    const save = persistOnce({ current: () => ({ draft: { ...blank, content: "x" }, fileIds: [] }), create, update, project: null });

    await save(BLANK_ARTIFACT_ID, { content: "x" }, options);
    await save(BLANK_ARTIFACT_ID, { content: "xy" }, options);
    await save("a-1", { content: "xyz" }, options);

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenNthCalledWith(1, "a-1", { content: "xy" }, expect.objectContaining({ expectedUpdatedAt: "2026-11-10T12:00:00.000Z" }));
    expect(update).toHaveBeenNthCalledWith(2, "a-1", { content: "xyz" }, options);
  });

  it("should let a failed create be retried without having stored anything", async () => {
    const create = vi.fn<() => Promise<ActionResult<ArtifactDto>>>()
      .mockResolvedValueOnce({ success: false, error: "Too many new artifacts." })
      .mockResolvedValueOnce({ success: true, data: stored("a-2") });
    const update = vi.fn();
    const save = persistOnce({ current: () => ({ draft: { ...blank, content: "x" }, fileIds: [] }), create, update, project: null });

    await expect(save(BLANK_ARTIFACT_ID, { content: "x" }, options)).resolves.toEqual({ success: false, error: "Too many new artifacts." });
    await expect(save(BLANK_ARTIFACT_ID, { content: "x" }, options)).resolves.toMatchObject({ success: true });
    expect(create).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
  });

  it("should not create again when a save waiting on a failed create returns", async () => {
    const held = heldCreate();
    const save = persistOnce({ current: () => ({ draft: { ...blank, content: "x" }, fileIds: [] }), create: held.create, update: vi.fn(), project: null });
    const first = save(BLANK_ARTIFACT_ID, { content: "x" }, options);
    const second = save(BLANK_ARTIFACT_ID, { content: "x" }, options);
    held.release({ success: false, error: "Offline" });
    await expect(first).resolves.toMatchObject({ success: false });
    await expect(second).resolves.toMatchObject({ success: false });
    expect(held.create).toHaveBeenCalledTimes(1);
  });

  it("should create with the whole current draft, its files, and the project", async () => {
    const create = vi.fn(() => Promise.resolve({ success: true as const, data: stored("a-3") }));
    const draft: BlankDraft = { ...blank, title: "", kind: "file" };
    const save = persistOnce({ current: () => ({ draft, fileIds: ["f-1", "f-2"] }), create, update: vi.fn(), project: "Launch" });
    await save(BLANK_ARTIFACT_ID, { kind: "file" }, options);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: UNTITLED, kind: "file", project: "Launch" }), ["f-1", "f-2"]);
  });
});
