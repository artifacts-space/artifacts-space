import { getSchema, type JSONContent } from "@tiptap/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownView } from "@/components/artifact-view/markdown-view";

import { markdownSchemaExtensions } from "@/components/editor/rich/markdown-schema";
import { parseMarkdown, serializeMarkdown } from "@/components/editor/rich/markdown-roundtrip";

import { commentFlavor, parseCommentMarkdown, serializeCommentMarkdown } from "./comment-markdown";
import { parseMentions } from "@/lib/comments/mentions";

import { mentionEditAt, mentionMatchAt } from "./mention-match";
import { quotedCommentBody } from "./quote-request";
import { threadShows } from "./thread-reading";

/*
 * The rich comment box reads and writes a comment's Markdown with the
 * artifact editor's round trip. These pin what that means for comments:
 * stored bodies come back unchanged, typed formatting becomes the Markdown
 * the thread renders, and @mentions stay plain text the server reads.
 */

const schema = getSchema(markdownSchemaExtensions());

function text(value: string, marks: string[] = []): JSONContent {
  return marks.length > 0 ? { type: "text", text: value, marks: marks.map((type) => ({ type })) } : { type: "text", text: value };
}

function paragraph(...content: JSONContent[]): JSONContent {
  return { type: "paragraph", content };
}

function written(content: JSONContent[]): string {
  return serializeCommentMarkdown({ type: "doc", content }, parseCommentMarkdown("").source);
}

/** What the thread shows for a comment's Markdown. */
function rendered(markdown: string): string {
  return renderToStaticMarkup(createElement(MarkdownView, { content: markdown }));
}

/** The comment loaded into the box, its first block changed by `edit`, and written back. */
function editedFirstBlock(body: string, edit: (block: JSONContent) => JSONContent): string {
  const loaded = parseCommentMarkdown(body);
  const [first, ...rest] = loaded.doc.content ?? [];
  if (!first) throw new Error("no block");
  return serializeCommentMarkdown({ type: "doc", content: [edit(first), ...rest] }, loaded.source);
}

/** Adds a word to the end of a paragraph's text. */
function addWord(block: JSONContent): JSONContent {
  return { ...block, content: [...(block.content ?? []), text(" more")] };
}

/** Changes "please" to "thanks" in a block kept as written. */
function rewordRaw(block: JSONContent): JSONContent {
  const source: unknown = block.attrs?.source;
  return { ...block, attrs: { ...block.attrs, source: typeof source === "string" ? source.replace("please", "thanks") : source } };
}

describe("comment Markdown in the rich box", () => {
  const stored = [
    "Hi @dana, can you check?",
    "line one\nline two",
    "> quote\n\nreply",
    "1. one\n2. two",
    "Use `@dana` here",
    "Price: $5 \\* 2",
    "Raw <b>html</b> stays",
    quotedCommentBody("Ship it on Friday.", "https://artifacts.space/artifact/abc#block=Ship"),
  ];

  it.each(stored)("should write a stored comment back exactly when nobody edits it: %j", (body) => {
    const loaded = parseCommentMarkdown(body);
    expect(serializeCommentMarkdown(loaded.doc, loaded.source)).toBe(body);
  });

  it("should show a quoted block as a quote, not as raw Markdown, when a comment starts from the block menu", () => {
    const loaded = parseCommentMarkdown(quotedCommentBody("Ship it on Friday.", "https://artifacts.space/artifact/abc#block=Ship"));
    expect(loaded.rawBlocks).toBe(0);
    expect(loaded.doc.content?.map((node) => node.type)).toEqual(["blockquote"]);
  });

  it("should keep the untouched blocks of an edited comment as written when a paragraph is added", () => {
    const body = "Hi @dana,\n\n* first\n* second";
    const loaded = parseCommentMarkdown(body);
    const content = [...(loaded.doc.content ?? []), paragraph(text("Thanks!"))];
    expect(serializeCommentMarkdown({ type: "doc", content }, loaded.source)).toBe(`${body}\n\nThanks!`);
  });

  it("should write bold, a list, and a mention as Markdown when they are typed in the box", () => {
    const markdown = written([
      paragraph(text("Hi @dana, this is "), text("bold", ["bold"])),
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("one"))] }, { type: "listItem", content: [paragraph(text("two"))] }] },
    ]);
    expect(markdown).toBe("Hi @dana, this is **bold**\n\n- one\n- two");
    expect(parseMentions(markdown)).toEqual(["dana"]);
  });

  it("should end a new comment without a trailing newline when it is one paragraph", () => {
    expect(written([paragraph(text("Looks good."))])).toBe("Looks good.");
  });
});

describe("typed comment text", () => {
  const plain = ["Q&A at 3 < 4pm", "rename snake_case_name", "Use C:\\temp", "see [docs] page", "2 * 3", "50% off, a+b=c, #3 in line", "ok -- fine"];

  it.each(plain)("should store %j exactly as typed and render it as the editor's fully escaped form does", (typed) => {
    const stored = written([paragraph(text(typed))]);
    expect(stored).toBe(typed);
    const escaped = serializeMarkdown({ type: "doc", content: [paragraph(text(typed))] }, parseMarkdown("").source);
    expect(rendered(stored)).toBe(rendered(escaped));
  });

  const literal: [string, string][] = [
    ["*not bold*", "\\*not bold\\*"],
    ["# not a heading", "\\# not a heading"],
    ["1. not a list", "1\\. not a list"],
    ["- not a list", "\\- not a list"],
    ["<b>literal</b>", "&lt;b>literal&lt;/b>"],
    ["&copy; as letters", "&amp;copy; as letters"],
    ["[a link](notes) as text", "[a link\\](notes) as text"],
  ];

  it.each(literal)("should escape %j only as far as it must and render it as typed", (typed, expected) => {
    const stored = written([paragraph(text(typed))]);
    expect(stored).toBe(expected);
    expect(rendered(stored)).toBe(renderToStaticMarkup(createElement("div", { className: "artifact-prose" }, createElement("p", null, typed))));
  });

  it.each(literal)("should keep %j literal after a save and a re-edit", (typed) => {
    const stored = written([paragraph(text(typed))]);
    const again = editedFirstBlock(stored, addWord);
    const reloaded = parseCommentMarkdown(again).doc.content;
    expect(reloaded?.map((block) => block.content)).toEqual([[text(`${typed} more`)]]);
  });

  it("should keep &, <, and _ as typed when a block that holds them is edited", () => {
    expect(editedFirstBlock("Q&A at 3 < 4pm on snake_case", addWord)).toBe("Q&A at 3 < 4pm on snake_case more");
  });

  it("should keep text in code exactly when it holds Markdown characters", () => {
    expect(written([paragraph(text("a*b_c<d&e;", ["code"]))])).toBe("`a*b_c<d&e;`");
  });
});

describe("blocks a comment keeps as written", () => {
  it("should keep an escaped mention escaped, and no mention, when its paragraph is edited", () => {
    const loaded = parseCommentMarkdown("\\@dana please");
    expect(loaded.rawBlocks).toBe(1);
    const saved = editedFirstBlock("\\@dana please", rewordRaw);
    expect(saved).toBe("\\@dana thanks");
    expect(parseMentions(saved)).toEqual([]);
  });

  it("should keep a real entity when its paragraph is edited", () => {
    const saved = editedFirstBlock("&copy; 2026 please", rewordRaw);
    expect(saved).toBe("&copy; 2026 thanks");
    expect(rendered(saved)).toContain("© 2026");
  });

  it("should keep literal entity text literal when its paragraph is edited", () => {
    const saved = editedFirstBlock("&amp;copy; is how you write it", addWord);
    expect(saved).toBe("&amp;copy; is how you write it more");
    expect(rendered(saved)).toContain("&amp;copy; is how you write it more");
  });

  it("should show a mention typed in full as a mention when it is not escaped", () => {
    expect(parseCommentMarkdown("@dana please").rawBlocks).toBe(0);
  });
});

/** A one-paragraph document and the position just after `caretAt` characters of its text. */
function cursorIn(value: string, caretAt: number, marks: string[] = []) {
  const doc = schema.nodeFromJSON({ type: "doc", content: [paragraph(text(value, marks))] });
  return { doc, $position: doc.resolve(1 + caretAt) };
}

describe("mentionMatchAt", () => {
  it("should find the @handle being typed when the cursor is right after it", () => {
    const match = mentionMatchAt(cursorIn("Hi @da", 6).$position);
    expect(match?.query).toEqual({ start: 3, query: "da" });
    expect(match?.range).toEqual({ from: 4, to: 7 });
  });

  it("should find nothing when the @ is part of an email", () => {
    expect(mentionMatchAt(cursorIn("mail me@exa", 11).$position)).toBeNull();
  });

  it("should find nothing when the cursor is in inline code", () => {
    expect(mentionMatchAt(cursorIn("@da", 3, ["code"]).$position)).toBeNull();
  });

  it("should find nothing when the cursor is in a code block", () => {
    const doc = schema.nodeFromJSON({ type: "doc", content: [{ type: "codeBlock", content: [text("@da")] }] });
    expect(mentionMatchAt(doc.resolve(4))).toBeNull();
  });
});

describe("mentionEditAt", () => {
  it("should replace the typed letters with the handle and a space when the mention ends the line", () => {
    const match = mentionMatchAt(cursorIn("Hi @da", 6).$position);
    expect(match && mentionEditAt(match, "dana")).toEqual({ from: 4, to: 7, insert: "@dana ", caret: 10 });
  });

  it("should replace the rest of the handle and step over the space when text follows", () => {
    const match = mentionMatchAt(cursorIn("@daxx please", 3).$position);
    expect(match && mentionEditAt(match, "dana")).toEqual({ from: 1, to: 6, insert: "@dana", caret: 7 });
  });
});

describe("writing a comment on every keystroke", () => {
  function countingFlavor() {
    const calls = { count: 0 };
    const flavor = {
      shows: (markdown: string, nodes: readonly JSONContent[]) => {
        calls.count += 1;
        return threadShows(markdown, nodes);
      },
    };
    return { flavor, calls };
  }

  const blocks = [paragraph(text("First, a plain line.")), paragraph(text("Second, with "), text("bold", ["bold"])), paragraph(text("Third: snake_case"))];
  const empty = parseCommentMarkdown("").source;

  it("should not judge any block again when the comment is written unchanged", () => {
    const { flavor, calls } = countingFlavor();
    const first = serializeMarkdown({ type: "doc", content: blocks }, empty, flavor);
    const judged = calls.count;
    expect(serializeMarkdown({ type: "doc", content: blocks }, empty, flavor)).toBe(first);
    expect(calls.count).toBe(judged);
  });

  it("should judge only the edited block when one block changes", () => {
    const { flavor, calls } = countingFlavor();
    serializeMarkdown({ type: "doc", content: blocks }, empty, flavor);
    const judged = calls.count;
    const edited = [blocks[0], paragraph(text("Second, now edited")), blocks[2]].filter((block) => block !== undefined);
    expect(serializeMarkdown({ type: "doc", content: edited }, empty, flavor)).toBe("First, a plain line.\n\nSecond, now edited\n\nThird: snake_case");
    expect(calls.count).toBe(judged + 1);
  });
});

describe("the comment text encoder", () => {
  const block = { type: "doc", content: [paragraph(text("rename snake_case_name"))] };
  const empty = parseCommentMarkdown("").source;

  it("should write a comment with only the escapes it needs when the manager's text encoder is hooked", () => {
    expect(serializeMarkdown(block, empty, commentFlavor)).toBe("rename snake_case_name");
  });

  it("should write a document with the manager's own escaping when no comment is being written", () => {
    expect(serializeMarkdown(block, empty, "document")).toBe("rename snake\\_case\\_name");
  });
});

describe("editing a list in a comment", () => {
  /** The comment with the first list item's text replaced. */
  function withFirstItem(markdown: string, value: string): string {
    const loaded = parseCommentMarkdown(markdown);
    const doc = structuredClone(loaded.doc);
    const item = doc.content?.find((node) => node.type?.endsWith("List"))?.content?.[0]?.content?.[0];
    if (item) item.content = [text(value)];
    return serializeCommentMarkdown(doc, loaded.source);
  }

  it("should write the edited item as typed, not with a document's escaping, when a stored comment's list is edited", () => {
    expect(withFirstItem("- one\n- two\n", "rename snake_case 2 * 3")).toBe("- rename snake_case 2 * 3\n- two\n");
    expect(withFirstItem("1. one\n2. two\n", "rename snake_case")).toBe("1. rename snake_case\n2. two\n");
  });

  it("should write an artifact's edited item with the document's escaping when the same list is edited there", () => {
    const loaded = parseMarkdown("- one\n- two\n");
    const doc = structuredClone(loaded.doc);
    const item = doc.content?.[0]?.content?.[0]?.content?.[0];
    if (item) item.content = [text("rename snake_case")];
    expect(serializeMarkdown(doc, loaded.source)).toBe("- rename snake\\_case\n- two\n");
  });
});
