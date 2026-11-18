import type { JSONContent } from "@tiptap/core";

/*
 * Inline code sits beside bold, italic, strike, and links in the editor
 * (`withNestableCode` in markdown-schema.ts), but Markdown can only nest
 * code inside them: `**` between backticks is literal text. When the other
 * marks change in the middle of a run of code (part of `abc` made bold),
 * the run has to be written as several code spans, each wrapped in its own
 * marks: `` `a`**`b`**`c` ``, which reads back as the same text and marks.
 *
 * Tiptap's Markdown manager keeps a mark open while the next text carries
 * an equal mark, attributes included. So before writing, each code mark
 * gets a `span` number that changes wherever the other marks change; the
 * manager then closes the backticks there and opens new ones. The number
 * never reaches the document: only the copy handed to the writer has it.
 */

type Mark = NonNullable<JSONContent["marks"]>[number];

const CODE = "code";

/** The marks other than code, as one comparable string. */
function otherMarksKey(marks: readonly Mark[]): string {
  return JSON.stringify(marks.filter((mark) => mark.type !== CODE).map((mark) => [mark.type, mark.attrs ?? null]));
}

/** Inline content whose code marks carry a span number that changes wherever the other marks do. */
function taggedInline(content: readonly JSONContent[]): JSONContent[] {
  let span = 0;
  let previousKey: string | null = null;
  return content.map((child) => {
    const marks = child.marks ?? [];
    if (!marks.some((mark) => mark.type === CODE)) {
      previousKey = null;
      return child;
    }
    const key = otherMarksKey(marks);
    if (previousKey !== null && key !== previousKey) span += 1;
    previousKey = key;
    return { ...child, marks: marks.map((mark) => (mark.type === CODE ? { ...mark, attrs: { ...mark.attrs, span } } : mark)) };
  });
}

/**
 * A copy of `nodes` ready for the Markdown writer: every run of inline code
 * whose other marks change part way is split into spans the writer closes
 * and opens again, so no mark is ever written between backticks.
 */
export function withCodeSpans(nodes: readonly JSONContent[]): JSONContent[] {
  return nodes.map((node) => {
    if (!node.content) return node;
    const inline = node.content.some((child) => child.type === "text");
    return { ...node, content: inline ? taggedInline(node.content) : withCodeSpans(node.content) };
  });
}
