import { describe, expect, it } from "vitest";

import { capHunks, diffHunks, diffLines, diffStats, splitLines, type DiffLine } from "./diff";

function ops(lines: DiffLine[]) {
  return lines.map((line) => `${line.op === "same" ? " " : line.op === "add" ? "+" : "-"}${line.text}`);
}

/** Rebuilds both texts from a diff, to check that nothing is lost. */
function sides(lines: DiffLine[]) {
  return {
    before: lines.filter((line) => line.op !== "add").map((line) => line.text),
    after: lines.filter((line) => line.op !== "remove").map((line) => line.text),
  };
}

describe("splitLines", () => {
  it("should ignore a final newline when splitting", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
  });

  it("should treat CRLF like LF when lines come from Windows", () => {
    expect(splitLines("a\r\nb")).toEqual(["a", "b"]);
  });

  it("should give no lines when the text is empty", () => {
    expect(splitLines("")).toEqual([]);
  });
});

describe("diffLines", () => {
  it("should mark every line the same when the texts are equal", () => {
    expect(ops(diffLines("a\nb", "a\nb"))).toEqual([" a", " b"]);
  });

  it("should show one changed line as a removal then an addition", () => {
    expect(ops(diffLines("a\nb\nc", "a\nB\nc"))).toEqual([" a", "-b", "+B", " c"]);
  });

  it("should keep shared lines when lines are inserted and deleted in the middle", () => {
    const lines = diffLines("one\ntwo\nthree\nfour", "one\nthree\nthree-and-a-half\nfour");
    expect(ops(lines)).toEqual([" one", "-two", " three", "+three-and-a-half", " four"]);
  });

  it("should number lines on each side when lines are added and removed", () => {
    const lines = diffLines("a\nb", "b\nc");
    expect(lines.map((line) => [line.oldNumber, line.newNumber])).toEqual([[1, null], [2, 1], [null, 2]]);
  });

  it("should handle an empty side when everything is added or removed", () => {
    expect(ops(diffLines("", "x\ny"))).toEqual(["+x", "+y"]);
    expect(ops(diffLines("x", ""))).toEqual(["-x"]);
  });

  it("should rebuild both texts exactly when the diff is long and scattered", () => {
    const before = Array.from({ length: 200 }, (_, i) => `line ${String(i)}`).join("\n");
    const after = Array.from({ length: 200 }, (_, i) => (i % 7 === 0 ? `changed ${String(i)}` : `line ${String(i)}`)).join("\n");
    const lines = diffLines(before, after);
    expect(sides(lines)).toEqual({ before: splitLines(before), after: splitLines(after) });
    expect(diffStats(lines)).toEqual({ added: 29, removed: 29 });
  });

  it("should fall back to remove-then-add when the texts differ more than the edit limit", () => {
    const lines = diffLines("a\nb\nc\nend", "x\ny\nz\nend", 2);
    expect(ops(lines)).toEqual(["-a", "-b", "-c", "+x", "+y", "+z", " end"]);
  });
});

describe("diffHunks", () => {
  const before = Array.from({ length: 30 }, (_, i) => String(i)).join("\n");

  it("should give no hunks when nothing changed", () => {
    expect(diffHunks(diffLines(before, before))).toEqual([]);
  });

  it("should keep three lines of context around a change when lines change", () => {
    const after = before.replace("\n15\n", "\nfifteen\n");
    const [hunk, ...rest] = diffHunks(diffLines(before, after));
    expect(rest).toEqual([]);
    expect(ops(hunk?.lines ?? [])).toEqual([" 12", " 13", " 14", "-15", "+fifteen", " 16", " 17", " 18"]);
  });

  it("should split far-apart changes into separate hunks when the gap is large", () => {
    const after = before.replace("\n2\n", "\ntwo\n").replace("\n25\n", "\ntwenty-five\n");
    expect(diffHunks(diffLines(before, after))).toHaveLength(2);
  });

  it("should merge nearby changes into one hunk when their context overlaps", () => {
    const after = before.replace("\n10\n", "\nten\n").replace("\n14\n", "\nfourteen\n");
    expect(diffHunks(diffLines(before, after))).toHaveLength(1);
  });
});

describe("capHunks", () => {
  const before = Array.from({ length: 40 }, (_, i) => String(i)).join("\n");
  const after = before.replace("\n5\n", "\nfive\n").replace("\n30\n", "\nthirty\n");

  it("should keep every hunk when they fit under the cap", () => {
    const hunks = diffHunks(diffLines(before, after));
    expect(capHunks(hunks, 100)).toEqual({ hunks, hidden: 0 });
  });

  it("should cut the last hunk and count hidden lines when the cap is reached", () => {
    const hunks = diffHunks(diffLines(before, after));
    const capped = capHunks(hunks, 10);
    expect(capped.hunks.flatMap((hunk) => hunk.lines)).toHaveLength(10);
    expect(capped.hidden).toBe(hunks.reduce((total, hunk) => total + hunk.lines.length, 0) - 10);
  });
});
