import { describe, expect, it } from "vitest";

import { sheetFormatLimits } from "./limits";
import {
  alignmentChoice,
  bandClass,
  canAlignColumn,
  cellAlignment,
  fitsSheetFormatInput,
  plainSheetFormat,
  readSheetFormat,
  sameSheetFormat,
  sheetFormatSchema,
  storedSheetFormat,
  withAlignment,
  withBanding,
} from "./rules";

describe("readSheetFormat", () => {
  it("should read plain when nothing is stored", () => {
    expect(readSheetFormat(null)).toEqual(plainSheetFormat);
    expect(readSheetFormat(undefined)).toEqual(plainSheetFormat);
  });

  it("should read plain when the stored value is invalid", () => {
    expect(readSheetFormat({ banding: "neon", align: {} })).toEqual(plainSheetFormat);
    expect(readSheetFormat({ banding: null, align: { '="a"': "justify" } })).toEqual(plainSheetFormat);
    expect(readSheetFormat("muted")).toEqual(plainSheetFormat);
  });

  it("should read valid formatting as stored", () => {
    const format = { banding: "accent", align: { '="price"': "right" } };
    expect(readSheetFormat(format)).toEqual(format);
  });
});

describe("sheetFormatSchema", () => {
  it("should refuse extra fields when formatting is saved", () => {
    expect(sheetFormatSchema.safeParse({ banding: null, align: {}, script: "x" }).success).toBe(false);
  });

  it("should refuse more aligned columns than the limit when formatting is saved", () => {
    const align = Object.fromEntries(Array.from({ length: sheetFormatLimits.maxAlignedColumns + 1 }, (_, index) => [`#${String(index)}`, "left"]));
    expect(sheetFormatSchema.safeParse({ banding: null, align }).success).toBe(false);
  });

  it("should refuse a column key longer than the limit when formatting is saved", () => {
    const key = "x".repeat(sheetFormatLimits.maxKeyChars + 1);
    expect(sheetFormatSchema.safeParse({ banding: null, align: { [key]: "left" } }).success).toBe(false);
    expect(canAlignColumn(key)).toBe(false);
  });

  it("should refuse input bigger than the input limit before it is parsed", () => {
    expect(fitsSheetFormatInput({ banding: null, align: { a: "x".repeat(sheetFormatLimits.maxInputBytes) } })).toBe(false);
    expect(fitsSheetFormatInput(plainSheetFormat)).toBe(true);
  });

  it("should count bytes, not characters, so wide text cannot pass the input cap and still fail the stored one", () => {
    // 100 keys of 200 CJK characters: about 20,000 characters, but about 60,000 bytes.
    const align = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`${"字".repeat(197)}${String(index).padStart(3, "0")}`, "left"]));
    expect(JSON.stringify({ banding: null, align }).length).toBeLessThan(sheetFormatLimits.maxInputBytes);
    expect(fitsSheetFormatInput({ banding: null, align })).toBe(false);
  });
});

describe("withAlignment", () => {
  it("should set a column's alignment and drop columns the sheet no longer has", () => {
    const format = { banding: null, align: { '="gone"': "center", '="kept"': "left" } } as const;
    expect(withAlignment(format, '="price"', "right", ['="kept"', '="price"']).align).toEqual({ '="kept"': "left", '="price"': "right" });
  });

  it("should remove the entry when the column goes back to auto", () => {
    const format = { banding: null, align: { '="price"': "center" } } as const;
    expect(withAlignment(format, '="price"', "auto", ['="price"']).align).toEqual({});
  });

  it("should drop columns the sheet no longer has when only banding changes", () => {
    const format = { banding: null, align: { '="gone"': "center", '="kept"': "left" } } as const;
    expect(withBanding(format, "muted", ['="kept"'])).toEqual({ banding: "muted", align: { '="kept"': "left" } });
  });

  it("should treat formattings as the same whatever order their columns come in, and different otherwise", () => {
    const a = { banding: "muted", align: { '="a"': "left", '="b"': "right" } } as const;
    const b = { banding: "muted", align: { '="b"': "right", '="a"': "left" } } as const;
    expect(sameSheetFormat(a, b)).toBe(true);
    expect(sameSheetFormat(a, { ...a, banding: null })).toBe(false);
    expect(sameSheetFormat(a, { banding: "muted", align: { '="a"': "left" } })).toBe(false);
    expect(sameSheetFormat(a, { banding: "muted", align: { '="a"': "left", '="b"': "center" } })).toBe(false);
  });
});

describe("cellAlignment", () => {
  it("should line numbers up right and everything else left when a column is on auto", () => {
    expect(cellAlignment(plainSheetFormat, '="price"', true)).toBe("right");
    expect(cellAlignment(plainSheetFormat, '="name"', false)).toBe("left");
    expect(alignmentChoice(plainSheetFormat, '="name"')).toBe("auto");
  });

  it("should use the chosen alignment when a column has one", () => {
    const format = { banding: null, align: { '="price"': "center" } } as const;
    expect(cellAlignment(format, '="price"', true)).toBe("center");
  });
});

describe("storedSheetFormat", () => {
  it("should store nothing when the sheet is plain", () => {
    expect(storedSheetFormat(withBanding(withBanding(plainSheetFormat, "muted", []), null, []))).toBeNull();
  });

  it("should store the formatting when banding is on", () => {
    expect(storedSheetFormat(withBanding(plainSheetFormat, "primary", []))).toEqual({ banding: "primary", align: {} });
  });
});

describe("bandClass", () => {
  it("should tint rows only with theme tokens, and keep the tint under the pointer, when banding is on", () => {
    expect(bandClass(null)).toBe("");
    for (const banding of ["muted", "accent", "primary"] as const) expect(bandClass(banding)).toMatch(/^bg-(muted|accent|primary)\/\d+ hover:bg-\1\/\d+$/);
  });
});
