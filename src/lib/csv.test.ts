import { describe, expect, it } from "vitest";

import { detectDelimiter, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("should split a header and rows when the input is simple", () => {
    const result = parseCsv("name,score\nAda,10\nLin,9\n");
    expect(result.header).toEqual(["name", "score"]);
    expect(result.rows).toEqual([["Ada", "10"], ["Lin", "9"]]);
    expect(result.totalRows).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it("should keep separators, line breaks, and doubled quotes when a field is quoted", () => {
    const result = parseCsv('a,b\n"x, y","line 1\nline 2"\n"say ""hi""",z');
    expect(result.rows).toEqual([["x, y", "line 1\nline 2"], ['say "hi"', "z"]]);
  });

  it("should accept CRLF, LF, and CR line endings when they are mixed", () => {
    const result = parseCsv("a\r\n1\n2\r3");
    expect(result.rows).toEqual([["1"], ["2"], ["3"]]);
  });

  it("should ignore a byte-order mark and blank lines when present", () => {
    const result = parseCsv("﻿a,b\n\n1,2\n\n");
    expect(result.header).toEqual(["a", "b"]);
    expect(result.rows).toEqual([["1", "2"]]);
  });

  it("should keep empty fields when separators are adjacent", () => {
    expect(parseCsv("a,b,c\n,,\n").rows).toEqual([["", "", ""]]);
  });

  it("should keep a quoted empty field as a row when it is alone on a line", () => {
    expect(parseCsv('a\n""\n').rows).toEqual([[""]]);
  });

  it("should cut rows and count the rest when the cap is reached", () => {
    const text = ["n", ...Array.from({ length: 50 }, (_, index) => String(index))].join("\n");
    const result = parseCsv(text, { maxRows: 10 });
    expect(result.rows).toHaveLength(10);
    expect(result.totalRows).toBe(50);
    expect(result.truncated).toBe(true);
  });

  it("should report an error and keep the text when a quote never closes", () => {
    const result = parseCsv('a,b\n1,"open');
    expect(result.errors).toHaveLength(1);
    expect(result.rows).toEqual([["1", "open"]]);
  });

  it("should report the widest record when rows are ragged", () => {
    expect(parseCsv("a\n1,2,3\n4").columnCount).toBe(3);
  });

  it("should return nothing when the input is empty", () => {
    const result = parseCsv("");
    expect(result.header).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("should parse a semicolon file when the delimiter is detected", () => {
    expect(parseCsv("a;b\n1;2").rows).toEqual([["1", "2"]]);
  });
});

describe("detectDelimiter", () => {
  it("should pick tab when the first line is tab separated", () => {
    expect(detectDelimiter("a\tb\tc\n1,2,3")).toBe("\t");
  });

  it("should ignore separators inside quotes when counting", () => {
    expect(detectDelimiter('"a;b;c",d\n')).toBe(",");
  });
});
