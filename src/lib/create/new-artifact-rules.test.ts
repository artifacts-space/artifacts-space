import { describe, expect, it, vi } from "vitest";

import type { ActionResult, ArtifactDto, ArtifactInput } from "@/lib/artifact-types";

import { BLANK_ARTIFACT_ID, blankDraftProblem, contentRoute, createInputFor, filesForCreate, isUntouched, leavesPasteToEditor, persistOnce, UNTITLED, uploadStep, uploadsToDiscard, type BlankDraft } from "./new-artifact-rules";

const blank: BlankDraft = { title: "", icon: null, summary: "", content: "", language: "", kind: "markdown" };
const requestId = "0b6f6d43-8a8f-4b52-9f44-2f8c1a6d3e10";
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
    const save = persistOnce({ current: () => ({ draft: { ...blank, title: "Plan" }, fileIds: [] }), create: held.create, update, project: null, requestId });

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
    const save = persistOnce({ current: () => ({ draft: { ...blank, content: "x" }, fileIds: [] }), create, update, project: null, requestId });

    await save(BLANK_ARTIFACT_ID, { content: "x" }, options);
    await save(BLANK_ARTIFACT_ID, { content: "xy" }, options);
    await save("a-1", { content: "xyz" }, options);

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenNthCalledWith(1, "a-1", { content: "xy" }, expect.objectContaining({ expectedUpdatedAt: "2026-11-10T12:00:00.000Z" }));
    expect(update).toHaveBeenNthCalledWith(2, "a-1", { content: "xyz" }, options);
  });

  it("should send the same create id on every try, so a retry after a lost response finds the first", async () => {
    const create = vi.fn<(input: ArtifactInput, fileIds: string[], requestId: string) => Promise<ActionResult<ArtifactDto>>>()
      .mockResolvedValueOnce({ success: false, error: "Offline" })
      .mockResolvedValueOnce({ success: true, data: stored("a-4") });
    const save = persistOnce({ current: () => ({ draft: { ...blank, content: "x" }, fileIds: [] }), create, update: vi.fn(), project: null, requestId });
    await save(BLANK_ARTIFACT_ID, { content: "x" }, options);
    await save(BLANK_ARTIFACT_ID, { content: "x" }, options);
    expect(create.mock.calls.map(([, , id]) => id)).toEqual([requestId, requestId]);
    expect(create.mock.calls.map(([input]) => input.sessionId), "the create id never rides in the agent's session id").toEqual([undefined, undefined]);
  });

  it("should let a failed create be retried without having stored anything", async () => {
    const create = vi.fn<() => Promise<ActionResult<ArtifactDto>>>()
      .mockResolvedValueOnce({ success: false, error: "Too many new artifacts." })
      .mockResolvedValueOnce({ success: true, data: stored("a-2") });
    const update = vi.fn();
    const save = persistOnce({ current: () => ({ draft: { ...blank, content: "x" }, fileIds: [] }), create, update, project: null, requestId });

    await expect(save(BLANK_ARTIFACT_ID, { content: "x" }, options)).resolves.toEqual({ success: false, error: "Too many new artifacts." });
    await expect(save(BLANK_ARTIFACT_ID, { content: "x" }, options)).resolves.toMatchObject({ success: true });
    expect(create).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
  });

  it("should not create again when a save waiting on a failed create returns", async () => {
    const held = heldCreate();
    const save = persistOnce({ current: () => ({ draft: { ...blank, content: "x" }, fileIds: [] }), create: held.create, update: vi.fn(), project: null, requestId });
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
    const save = persistOnce({ current: () => ({ draft, fileIds: ["f-1", "f-2"] }), create, update: vi.fn(), project: "Launch", requestId });
    await save(BLANK_ARTIFACT_ID, { kind: "file" }, options);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: UNTITLED, kind: "file", project: "Launch" }), ["f-1", "f-2"], requestId);
  });
});

describe("uploadStep", () => {
  const state = { stored: false, busy: false, readyIds: ["f-1"], attachedIds: [] as string[], handedIds: [] as string[] };

  it("should do nothing when no file was dropped", () => {
    expect(uploadStep({ ...state, readyIds: [] })).toEqual({ step: "none" });
  });

  it("should wait while any file is still uploading", () => {
    expect(uploadStep({ ...state, busy: true })).toEqual({ step: "wait" });
    expect(uploadStep({ ...state, readyIds: [], busy: true })).toEqual({ step: "wait" });
  });

  it("should hand the files to the create while the page is blank", () => {
    expect(uploadStep(state)).toEqual({ step: "create", ids: ["f-1"] });
  });

  it("should wait for the create once it has the files", () => {
    expect(uploadStep({ ...state, handedIds: ["f-1"] })).toEqual({ step: "wait" });
  });

  it("should hand only the files the create does not have yet when another file finishes before it starts", () => {
    expect(uploadStep({ ...state, readyIds: ["f-1", "f-2"], handedIds: ["f-1"] })).toEqual({ step: "create", ids: ["f-2"] });
  });

  it("should attach files the stored artifact does not have when it was stored first", () => {
    expect(uploadStep({ ...state, stored: true })).toEqual({ step: "attach", ids: ["f-1"] });
  });

  it("should attach a file that finished while the create was already on its way", () => {
    expect(uploadStep({ ...state, stored: true, readyIds: ["f-1", "f-2"], attachedIds: ["f-1"], handedIds: ["f-1", "f-2"] })).toEqual({ step: "attach", ids: ["f-2"] });
  });

  it("should be done once the stored artifact has every file", () => {
    expect(uploadStep({ ...state, stored: true, attachedIds: ["f-1"], handedIds: ["f-1"] })).toEqual({ step: "done" });
  });
});

describe("contentRoute", () => {
  const empty = { active: true, kind: "markdown", content: "", uploadCount: 0 };

  it("should read text or files as first content when the body is empty", () => {
    expect(contentRoute(true, empty)).toBe("first");
    expect(contentRoute(false, empty)).toBe("first");
  });

  it("should upload and attach a file, never read it into the body, when someone typed first", () => {
    const typed = { ...empty, content: "Written first" };
    expect(contentRoute(false, typed)).toBe("upload");
    expect(contentRoute(true, typed), "a paste is the editor's").toBe("ignore");
  });

  it("should upload and attach a file when the page's format is not Markdown", () => {
    expect(contentRoute(false, { ...empty, kind: "csv", content: "a,b\n1,2" })).toBe("upload");
    expect(contentRoute(false, { ...empty, kind: "code", content: "" })).toBe("upload");
  });

  it("should add files dropped during an upload to the uploads, not read them, when the body is still empty", () => {
    const uploading = { ...empty, uploadCount: 1 };
    expect(contentRoute(false, uploading)).toBe("upload");
    expect(contentRoute(true, uploading)).toBe("ignore");
  });

  it("should leave everything to the editor when the page is not a new artifact", () => {
    expect(contentRoute(false, { ...empty, active: false })).toBe("ignore");
    expect(contentRoute(true, { ...empty, active: false })).toBe("ignore");
  });
});

describe("uploadStep for a page with content", () => {
  it("should hand the files to the create when the page has writing but is not stored yet", () => {
    expect(uploadStep({ stored: false, busy: false, readyIds: ["f-1"], attachedIds: [], handedIds: [] })).toEqual({ step: "create", ids: ["f-1"] });
  });

  it("should attach the files when the page with writing is already stored", () => {
    expect(uploadStep({ stored: true, busy: false, readyIds: ["f-1"], attachedIds: [], handedIds: [] })).toEqual({ step: "attach", ids: ["f-1"] });
  });
});

describe("filesForCreate", () => {
  it("should leave out a handed file that was removed before the create", () => {
    expect(filesForCreate(["f-1", "f-2"], ["f-2"])).toEqual(["f-2"]);
  });

  it("should carry nothing when every handed file was removed", () => {
    expect(filesForCreate(["f-1"], [])).toEqual([]);
  });
});

describe("uploadsToDiscard", () => {
  const base = { readyIds: ["f-1", "f-2", "f-3"], attachedIds: [] as string[], handedIds: [] as string[], holdIds: [] as string[], create: "none" as const };

  it("should delete finished uploads that reached no artifact when the page goes", () => {
    expect(uploadsToDiscard(base)).toEqual(["f-1", "f-2", "f-3"]);
  });

  it("should never delete a file the artifact has", () => {
    expect(uploadsToDiscard({ ...base, attachedIds: ["f-1"], create: "stored" })).toEqual(["f-2", "f-3"]);
  });

  it("should never delete a file whose attach is on its way or whose answer was lost", () => {
    expect(uploadsToDiscard({ ...base, holdIds: ["f-2"], create: "stored" })).toEqual(["f-1", "f-3"]);
  });

  it("should keep files handed to a create that is on its way, has an unknown outcome, or stored them", () => {
    for (const create of ["none", "inFlight", "unknown", "stored"] as const) {
      expect(uploadsToDiscard({ ...base, handedIds: ["f-1"], create })).toEqual(["f-2", "f-3"]);
    }
  });

  it("should delete files handed to a create that was refused", () => {
    expect(uploadsToDiscard({ ...base, handedIds: ["f-1"], create: "failed" })).toEqual(["f-1", "f-2", "f-3"]);
  });
});

describe("leavesPasteToEditor", () => {
  it("should leave a rich paste of writing to the editor so headings, links, bold, and lists survive", () => {
    expect(leavesPasteToEditor("Plan\nRead the docs", true)).toBe(true);
  });

  it("should still read a paste whose text is data, even when it carries HTML", () => {
    expect(leavesPasteToEditor("name,value\nAda,1\nBo,2", true)).toBe(false);
    expect(leavesPasteToEditor('{ "a": 1 }', true)).toBe(false);
  });

  it("should read a plain-text paste itself", () => {
    expect(leavesPasteToEditor("Plan\nRead the docs", false)).toBe(false);
  });
});
