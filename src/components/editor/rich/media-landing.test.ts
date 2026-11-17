import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { caretLanding, endLanding } from "./media-landing";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    media: { group: "block", atom: true },
    text: {},
  },
});

const line = (text: string) => schema.node("paragraph", null, text ? [schema.text(text)] : []);
const media = () => schema.node("media");

describe("caretLanding", () => {
  it("should land after the block the cursor is in when that block has text", () => {
    const doc = schema.node("doc", null, [line("First"), line("Second")]);
    // Inside "First" (positions 1 to 6); the block ends at 7.
    expect(caretLanding(doc, doc.resolve(3))).toBe(7);
  });

  it("should land in place of the line when the cursor is on an empty line", () => {
    const doc = schema.node("doc", null, [line("First"), line(""), line("Third")]);
    // The empty line starts at 7; a position inside it makes the insert replace it.
    expect(caretLanding(doc, doc.resolve(8))).toBe(8);
  });

  it("should land after a selected block that holds no text", () => {
    const doc = schema.node("doc", null, [line("First"), media(), line("Third")]);
    // A selected picture: the selection ends just after it, between two blocks.
    expect(caretLanding(doc, doc.resolve(8))).toBe(8);
  });
});

describe("endLanding", () => {
  it("should replace an empty last line and go after a last line with text", () => {
    const withEmpty = schema.node("doc", null, [line("First"), line("")]);
    expect(endLanding(withEmpty)).toBe(withEmpty.content.size - 1);
    const withText = schema.node("doc", null, [line("First")]);
    expect(endLanding(withText)).toBe(withText.content.size);
  });
});
