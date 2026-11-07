import { describe, expect, it } from "vitest";

import { csvTextStyle, detectDelimiter, parseCsv, serializeCsv, serializeCsvField } from "./csv";

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

describe("serializeCsv", () => {
  it("should give back the same cells when a parsed file is written and read again", () => {
    const source = 'name,note,score\nAda,"x, y",10\n"Lin ""LJ""","line 1\nline 2",\n,,\n';
    const parsed = parseCsv(source);
    const again = parseCsv(serializeCsv(parsed.header, parsed.rows, csvTextStyle(source)));
    expect(again.header).toEqual(parsed.header);
    expect(again.rows).toEqual(parsed.rows);
  });

  it("should write the same text when the file is already minimally quoted", () => {
    const source = 'a,b\n1,"x, y"\n2,"say ""hi"""\n';
    const parsed = parseCsv(source);
    expect(serializeCsv(parsed.header, parsed.rows, csvTextStyle(source))).toBe(source);
  });

  it("should quote a field when it holds a comma, a quote, or a line break", () => {
    expect(serializeCsvField("a,b")).toBe('"a,b"');
    expect(serializeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(serializeCsvField("one\ntwo")).toBe('"one\ntwo"');
    expect(serializeCsvField("cr\rhere")).toBe('"cr\rhere"');
    expect(serializeCsvField("plain text")).toBe("plain text");
  });

  it("should quote by the file's separator when it is not a comma", () => {
    expect(serializeCsvField("a;b", ";")).toBe('"a;b"');
    expect(serializeCsvField("a,b", ";")).toBe("a,b");
    expect(serializeCsv(["a", "b"], [["1,5", "2;3"]], { delimiter: ";", newline: "\n" })).toBe('a;b\n1,5;"2;3"');
  });

  it("should keep a row when its only field is empty", () => {
    const text = serializeCsv(["a"], [[""], ["x"]], { newline: "\n" });
    expect(parseCsv(text).rows).toEqual([[""], ["x"]]);
  });

  it("should use CRLF between records when no style is given", () => {
    expect(serializeCsv(["a"], [["1"]])).toBe("a\r\n1");
  });

  it("should keep ragged rows ragged when writing", () => {
    expect(serializeCsv(["a", "b", "c"], [["1"], ["1", "2", "3", "4"]], { newline: "\n" })).toBe("a,b,c\n1\n1,2,3,4");
  });
});

describe("serializeCsv header", () => {
  it("should keep the separator detectable when a header name holds another separator", () => {
    const text = serializeCsv(["a;b;c", "x"], [["1", "2"]], { newline: "\n" });
    expect(text).toBe('"a;b;c",x\n1,2');
    expect(parseCsv(text).header).toEqual(["a;b;c", "x"]);
  });

  it("should write nothing when there is no header and no rows", () => {
    expect(serializeCsv([], [])).toBe("");
  });
});

describe("csvTextStyle", () => {
  it("should read CRLF, a trailing line break, and the separator when present", () => {
    expect(csvTextStyle("a;b\r\n1;2\r\n")).toEqual({ delimiter: ";", newline: "\r\n", trailingNewline: true });
    expect(csvTextStyle("a,b\n1,2")).toEqual({ delimiter: ",", newline: "\n", trailingNewline: false });
  });
});
