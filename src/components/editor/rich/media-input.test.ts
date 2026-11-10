import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { describe, expect, it } from "vitest";

import { uploadCleanupPlugin, uploadIdsAdded } from "./media-input";
import { emptyMediaAttrs, MEDIA_NODE } from "./media-markdown";
import { markdownSchemaExtensions } from "./markdown-schema";
import { queueUpload, uploadFile } from "./media-uploads";

const schema = getSchema(markdownSchemaExtensions());
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });

function editorWith(plugin: ReturnType<typeof uploadCleanupPlugin>) {
  return EditorState.create({ schema, doc: schema.node("doc", null, [schema.node("paragraph", null, [schema.text("Intro")])]), plugins: [plugin] });
}

function mediaNode(uploadId: string) {
  return schema.node(MEDIA_NODE, { ...emptyMediaAttrs("image"), uploadId });
}

describe("uploadCleanupPlugin", () => {
  it("should forget an upload whose block was deleted with the keyboard once the editor closes", () => {
    const plugin = uploadCleanupPlugin();
    const uploadId = queueUpload(png());
    let state = editorWith(plugin);
    const block = mediaNode(uploadId);
    const start = state.doc.content.size;
    state = state.apply(state.tr.insert(start, block));
    state = state.apply(state.tr.delete(start, start + block.nodeSize));
    expect(uploadFile(uploadId)).not.toBeNull();

    plugin.spec.view?.({ state } as EditorView).destroy?.();
    expect(uploadFile(uploadId)).toBeNull();
  });

  it("should forget uploads the document opened with when the editor closes", () => {
    const uploadId = queueUpload(png());
    const plugin = uploadCleanupPlugin();
    const state = EditorState.create({ schema, doc: schema.node("doc", null, [mediaNode(uploadId)]), plugins: [plugin] });
    plugin.spec.view?.({ state } as EditorView).destroy?.();
    expect(uploadFile(uploadId)).toBeNull();
  });
});

describe("uploadIdsAdded", () => {
  it("should name the uploads a change inserts, and none for typing", () => {
    const state = editorWith(uploadCleanupPlugin());
    expect(uploadIdsAdded(state.tr.insert(1, schema.text("x")))).toEqual([]);
    expect(uploadIdsAdded(state.tr.insert(state.doc.content.size, mediaNode("upload-1")))).toEqual(["upload-1"]);
  });
});
