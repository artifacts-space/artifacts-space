import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BlockEditorContext, type BlockEditor } from "./block-editor-context";
import { EditableText, type HeadingTag } from "./editable-text";

/** Only what EditableText reads from the editor: nothing asks for focus. */
const editor = { takeFocus: () => false } as unknown as BlockEditor;

function render(props: { value: string; heading?: HeadingTag; as?: "p"; className?: string }) {
  return renderToStaticMarkup(
    <BlockEditorContext.Provider value={editor}>
      <EditableText blockKey="b1" label="Section title" placeholder="Title" onChange={() => undefined} {...props} />
    </BlockEditorContext.Provider>,
  );
}

describe("EditableText", () => {
  it("should put the text box inside the heading when it is a title", () => {
    const html = render({ value: "", heading: "h2", className: "text-lg" });
    expect(html).toMatch(/^<h2 [^>]*class="text-lg"[^>]*><span role="textbox" aria-label="Section title"[^>]*><\/span><\/h2>$/);
  });

  it("should never give the heading itself the text box role when it is a title", () => {
    const html = render({ value: "Launch plan", heading: "h3" });
    expect(html).not.toMatch(/<h3[^>]*role=/);
    expect(html).toContain('contentEditable="plaintext-only"');
  });

  it("should take an empty title out of the outline when it has no text", () => {
    expect(render({ value: "", heading: "h2" })).toMatch(/^<h2 role="none"/);
  });

  it("should keep the box's own element and styles when it is not a title", () => {
    const html = render({ value: "", as: "p", className: "text-muted-foreground" });
    expect(html).toMatch(/^<p role="textbox"[^>]*class="[^"]*text-muted-foreground[^"]*"[^>]*><\/p>$/);
  });

  it("should show the placeholder on the text box when it is a title", () => {
    expect(render({ value: "", heading: "h2" })).toContain('<span role="textbox" aria-label="Section title" aria-multiline="false" contentEditable="plaintext-only" spellCheck="true" data-placeholder="Title"');
  });
});
