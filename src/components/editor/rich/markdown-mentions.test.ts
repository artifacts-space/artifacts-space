import { describe, expect, it } from "vitest";

import { parseMentions } from "@/lib/comments/mentions";

import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

/*
 * An @mention in a document is plain "@handle" text. The editor must write
 * it to Markdown as typed, or the server (which reads mentions from the
 * saved Markdown) would not find it.
 */
describe("an @mention in a document's Markdown", () => {
  it("should be written as plain @handle text when it is typed into a new paragraph", () => {
    const loaded = parseMarkdown("# Plan\n");
    const doc = { ...loaded.doc, content: [...(loaded.doc.content ?? []), { type: "paragraph", content: [{ type: "text", text: "Can @claude-code tighten this, with @dana?" }] }] };

    const saved = serializeMarkdown(doc, loaded.source);

    expect(saved).toContain("Can @claude-code tighten this, with @dana?");
    expect(parseMentions(saved)).toEqual(["claude-code", "dana"]);
  });

  it("should come back byte for byte when the document is loaded and saved untouched", () => {
    const markdown = "# Plan\n\nOver to @claude-code.\n\n- [ ] @dana reviews\n";
    const loaded = parseMarkdown(markdown);
    expect(serializeMarkdown(loaded.doc, loaded.source)).toBe(markdown);
  });
});
