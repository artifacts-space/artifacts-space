import { describe, expect, it } from "vitest";

import { blockHash, blockLink, buildBlockAnchor, encodeTextDirective, findAnchoredBlock, normalizeBlockText, parseBlockHash, startsWithWords, type AnchorBlock } from "./anchor-rules";

function block(text: string, topIndex: number, fileIds: string[] = []): AnchorBlock {
  return { text: normalizeBlockText(text), fileIds, topIndex };
}

const fileId = "0f8fad5b-d9cb-469f-a165-70867728950e";

const doc: AnchorBlock[] = [
  block("Four items waiting for you", 0),
  block("Written November 11, 2026 by the Supahost agent. Write your answer under each item.", 1),
  block("Answer: yes, review first.", 2),
  block("Answer: yes, review first. Leah maps listings after review.", 3),
  block("", 4, [fileId]),
  block("", 5),
  block("Same words in two blocks", 6),
  block("Same words in two blocks", 7),
];

describe("buildBlockAnchor", () => {
  it("should name a block by its first five words when they are unique", () => {
    expect(buildBlockAnchor(doc, 1)).toEqual({ kind: "words", words: "Written November 11, 2026 by", nth: 1 });
  });

  it("should use every word of a short block when it has fewer than five", () => {
    expect(buildBlockAnchor(doc, 0)).toEqual({ kind: "words", words: "Four items waiting for you", nth: 1 });
  });

  it("should add words until only one block starts with them when openings repeat", () => {
    expect(buildBlockAnchor(doc, 3)).toEqual({ kind: "words", words: "Answer: yes, review first. Leah", nth: 1 });
  });

  it("should say which match it is when a block's whole text starts another block", () => {
    expect(buildBlockAnchor(doc, 2)).toEqual({ kind: "words", words: "Answer: yes, review first.", nth: 1 });
    expect(buildBlockAnchor(doc, 7)).toEqual({ kind: "words", words: "Same words in two blocks", nth: 2 });
  });

  it("should name a block without text by the file it shows, else by its place", () => {
    expect(buildBlockAnchor(doc, 4)).toEqual({ kind: "file", fileId });
    expect(buildBlockAnchor(doc, 5)).toEqual({ kind: "place", index: 5 });
  });

  it("should return null when the block does not exist", () => {
    expect(buildBlockAnchor(doc, 99)).toBeNull();
  });

  it("should cap a long opening at 160 characters when the words are long", () => {
    const long = block(Array.from({ length: 40 }, () => "abcdefghij").join(" "), 0);
    const anchor = buildBlockAnchor([long, long], 0);
    expect(anchor?.kind === "words" ? anchor.words.length : 0).toBeLessThanOrEqual(160);
  });
});

describe("startsWithWords", () => {
  it("should match whole words only when the text starts with them", () => {
    expect(startsWithWords("Plan for Q3", "Plan")).toBe(true);
    expect(startsWithWords("Plan", "Plan")).toBe(true);
    expect(startsWithWords("Planning", "Plan")).toBe(false);
    expect(startsWithWords("Plan", "")).toBe(false);
  });
});

describe("blockHash and parseBlockHash", () => {
  it("should add a text fragment for the first block that starts with the words", () => {
    expect(blockHash({ kind: "words", words: "Steps - one, two & three", nth: 1 })).toBe(
      "#block=Steps%20-%20one%2C%20two%20%26%20three:~:text=Steps%20%2D%20one%2C%20two%20%26%20three",
    );
  });

  it("should leave out the text fragment when the browser could land on an earlier block", () => {
    expect(blockHash({ kind: "words", words: "Same words", nth: 2 })).toBe("#block=Same%20words&n=2");
    expect(blockHash({ kind: "file", fileId })).toBe(`#block-file=${fileId}`);
    expect(blockHash({ kind: "place", index: 3 })).toBe("#block-at=3");
  });

  it("should read back every anchor it writes when the browser keeps the text fragment", () => {
    const anchors = [
      { kind: "words", words: "Steps - one, two & three", nth: 1 },
      { kind: "words", words: "Same words", nth: 2 },
      { kind: "file", fileId },
      { kind: "place", index: 3 },
    ] as const;
    for (const anchor of anchors) expect(parseBlockHash(blockHash(anchor))).toEqual(anchor);
  });

  it("should read the anchor when the browser strips the text fragment", () => {
    expect(parseBlockHash("#block=Four%20items")).toEqual({ kind: "words", words: "Four items", nth: 1 });
  });

  it("should ignore fragments that name no block or are malformed", () => {
    expect(parseBlockHash("")).toBeNull();
    expect(parseBlockHash("#comments")).toBeNull();
    expect(parseBlockHash("#blockquote")).toBeNull();
    expect(parseBlockHash("#block=")).toBeNull();
    expect(parseBlockHash("#block=%20%20")).toBeNull();
    expect(parseBlockHash("#block=x&n=0")).toBeNull();
    expect(parseBlockHash("#block-file=not-a-uuid")).toBeNull();
    expect(parseBlockHash("#block-at=-1")).toBeNull();
    expect(parseBlockHash(`#block=${"a".repeat(400)}`)).toBeNull();
  });
});

describe("blockLink", () => {
  it("should link to the artifact page with the block's fragment", () => {
    expect(blockLink("https://artifacts.space", "abc123", { kind: "place", index: 0 })).toBe("https://artifacts.space/artifact/abc123#block-at=0");
  });
});

describe("encodeTextDirective", () => {
  it("should encode dashes, which mark a text fragment's context", () => {
    expect(encodeTextDirective("a-b")).toBe("a%2Db");
  });
});

describe("findAnchoredBlock", () => {
  it("should find the block a built anchor names when the page draws the same blocks", () => {
    doc.forEach((_, index) => {
      const anchor = buildBlockAnchor(doc, index);
      if (anchor) expect(findAnchoredBlock(doc, anchor)).toBe(index);
    });
  });

  it("should still find the block when other blocks were added above it", () => {
    const anchor = buildBlockAnchor(doc, 3);
    if (!anchor) throw new Error("No anchor");
    const edited = [block("A new first paragraph", 0), ...doc.map((item) => ({ ...item, topIndex: item.topIndex + 1 }))];
    expect(findAnchoredBlock(edited, anchor)).toBe(4);
  });

  it("should fall back to a block that contains the words when none starts with them", () => {
    expect(findAnchoredBlock([block("ts Copy const answer = 42", 0)], { kind: "words", words: "const answer = 42", nth: 1 })).toBe(0);
  });

  it("should take the last match when fewer blocks start with the words than the link says", () => {
    expect(findAnchoredBlock(doc, { kind: "words", words: "Same words in two blocks", nth: 5 })).toBe(7);
  });

  it("should return -1 when nothing matches", () => {
    expect(findAnchoredBlock(doc, { kind: "words", words: "Nowhere in this text", nth: 1 })).toBe(-1);
    expect(findAnchoredBlock(doc, { kind: "file", fileId: "7c9e6679-7425-40de-944b-e07fc1f90ae7" })).toBe(-1);
  });
});
