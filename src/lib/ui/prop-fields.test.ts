import { describe, expect, it } from "vitest";

import { uiComponentNames } from "./catalog";
import { describeProps, fieldLabel, propsProblem, readLines, readTextOrNumber, writeLines, type PropField } from "./prop-fields";

const field = (fields: readonly PropField[], name: string) => fields.find((entry) => entry.name === name);

describe("describeProps", () => {
  it("should give every prop of every component a form field, except a table's rows, which have their own grid", () => {
    const unsupported = uiComponentNames.flatMap((type) => {
      const walk = (fields: readonly PropField[], path: string): string[] =>
        fields.flatMap((entry) => {
          if (entry.model.kind === "unsupported") return [`${path}.${entry.name}`];
          return entry.model.kind === "rows" ? walk(entry.model.fields, `${path}.${entry.name}`) : [];
        });
      return walk(describeProps(type), type);
    });
    expect(unsupported).toEqual(["Table.rows"]);
  });

  it("should keep tab labels to one per panel, so tabs are added and removed as blocks", () => {
    expect(field(describeProps("Tabs"), "tabs")?.model).toMatchObject({ kind: "rows", fixed: true });
    expect(field(describeProps("Board"), "columns")?.model).toMatchObject({ kind: "rows", fixed: false });
  });

  it("should edit chart labels and series values one per line, with empty lines as gaps", () => {
    const chart = describeProps("Chart");
    expect(field(chart, "labels")?.model).toEqual({ kind: "lines", item: "text" });
    const series = field(chart, "series")?.model;
    expect(series?.kind === "rows" ? field(series.fields, "values")?.model : null).toEqual({ kind: "lines", item: "numberOrEmpty" });
  });

  it("should offer a choice for enums and a whole number for heading levels", () => {
    const heading = describeProps("Heading");
    expect(field(heading, "level")?.model).toEqual({ kind: "number", int: true, min: 1, max: 4 });
    expect(field(describeProps("Callout"), "tone")?.model).toMatchObject({ kind: "choice", options: ["neutral", "info", "success", "warning", "danger"] });
  });
});

describe("propsProblem", () => {
  it("should report a chart whose series has a different number of values than labels", () => {
    expect(propsProblem("Chart", { type: "bar", labels: ["Q1", "Q2"], series: [{ name: "A", values: [1] }] })).toMatch(/1 values but there are 2 labels/);
  });

  it("should name the field when the schema refuses a value", () => {
    expect(propsProblem("Heading", { text: "Hi", level: 9 })).toMatch(/^Level: /);
  });

  it("should accept props that pass the schema and the component's rules", () => {
    expect(propsProblem("Chart", { type: "bar", labels: ["Q1"], series: [{ name: "A", values: [1] }] })).toBeNull();
  });
});

describe("readLines and readTextOrNumber", () => {
  it("should read one number per line, an empty line as a gap, and ignore a trailing newline", () => {
    expect(readLines("3\n\n5\n", "numberOrEmpty")).toEqual([3, null, 5]);
    expect(readLines("3\n\n5", "number")).toEqual([3, 5]);
    expect(readLines("Q1\n\nQ2", "text")).toEqual(["Q1", "Q2"]);
    expect(writeLines([3, null, 5])).toBe("3\n\n5");
  });

  it("should read a cell as a number only when it is one", () => {
    expect(readTextOrNumber("42.5", false)).toBe(42.5);
    expect(readTextOrNumber("42 units", false)).toBe("42 units");
    expect(readTextOrNumber("  ", true)).toBeNull();
  });

  it("should label a camel-case prop in plain words", () => {
    expect(fieldLabel("changeFormat")).toBe("Change format");
  });
});
