import { describe, expect, it } from "vitest";

import { validateUiSpec } from "../validate";

function spec(type: string, props: Record<string, unknown>) {
  return { version: 1, root: "e", elements: { e: { type, props } } };
}

function messages(type: string, props: Record<string, unknown>) {
  return validateUiSpec(spec(type, props)).issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
}

describe("Chart props for pie and donut", () => {
  it("should accept a pie when it has one series of non-negative values", () => {
    expect(messages("Chart", { type: "pie", labels: ["a", "b"], series: [{ name: "s", values: [1, 0] }] })).toEqual([]);
  });

  it("should explain the one-series rule when a donut has two series", () => {
    const [message] = messages("Chart", { type: "donut", labels: ["a"], series: [{ name: "s", values: [1] }, { name: "t", values: [2] }] });
    expect(message).toContain("shows one series");
  });

  it("should name the negative value when a pie has one", () => {
    expect(messages("Chart", { type: "pie", labels: ["a", "b"], series: [{ name: "s", values: [1, -2] }] }).join("\n")).toContain("series[0].values[1] is negative");
  });
});

describe("Chart props for scatter", () => {
  it("should accept points without labels when the type is scatter", () => {
    expect(messages("Chart", { type: "scatter", series: [{ name: "s", points: [{ x: 1, y: 2, label: "p" }] }] })).toEqual([]);
  });

  it("should point at points when a scatter series sends values", () => {
    expect(messages("Chart", { type: "scatter", series: [{ name: "s", values: [1, 2] }] }).join("\n")).toContain("reads `points`");
  });

  it("should reject points when the type is bar", () => {
    expect(messages("Chart", { type: "bar", labels: ["a"], series: [{ name: "s", points: [{ x: 1, y: 2 }] }] }).join("\n")).toContain("only scatter charts use");
  });

  it("should reject more than 500 points in one series", () => {
    const points = Array.from({ length: 501 }, (_, index) => ({ x: index, y: index }));
    expect(messages("Chart", { type: "scatter", series: [{ name: "s", points }] }).join("\n")).toContain("props.series[0].points");
  });
});

describe("Chart props for stacking", () => {
  it("should accept stacked bars and areas", () => {
    const base = { labels: ["a"], series: [{ name: "s", values: [1] }, { name: "t", values: [-1] }], stacked: true };
    expect(messages("Chart", { ...base, type: "bar" })).toEqual([]);
    expect(messages("Chart", { ...base, type: "area" })).toEqual([]);
  });

  it("should reject stacked when the type is line", () => {
    expect(messages("Chart", { type: "line", labels: ["a"], series: [{ name: "s", values: [1] }], stacked: true }).join("\n")).toContain("bar and area charts only");
  });

  it("should ask for values when a bar series has none", () => {
    expect(messages("Chart", { type: "bar", labels: ["a"], series: [{ name: "s" }] }).join("\n")).toContain("needs `values`");
  });

  it("should accept eight series and reject nine", () => {
    const series = (count: number) => Array.from({ length: count }, (_, index) => ({ name: `s${String(index)}`, values: [index] }));
    expect(messages("Chart", { type: "bar", labels: ["a"], series: series(8) })).toEqual([]);
    expect(messages("Chart", { type: "bar", labels: ["a"], series: series(9) })).not.toEqual([]);
  });
});

describe("Metric sparkline", () => {
  it("should accept numbers and nulls when given a sparkline", () => {
    expect(messages("Metric", { label: "m", value: 1, sparkline: [1, null, 3] })).toEqual([]);
  });

  it("should reject text values in a sparkline", () => {
    expect(messages("Metric", { label: "m", value: 1, sparkline: [1, "2"] }).join("\n")).toContain("props.sparkline[1]");
  });
});

describe("KeyValue props", () => {
  it("should accept mixed value types when formats and tones are valid", () => {
    const items = [{ label: "a", value: "x", tone: "success" }, { label: "b", value: 3, format: "currency" }, { label: "c", value: true }, { label: "d", value: null, mono: true }];
    expect(messages("KeyValue", { items, columns: 2, currency: "EUR" })).toEqual([]);
  });

  it("should reject an unknown tone and three columns", () => {
    const found = messages("KeyValue", { items: [{ label: "a", value: "x", tone: "red" }], columns: 3 }).join("\n");
    expect(found).toContain("props.items[0].tone");
    expect(found).toContain("props.columns");
  });

  it("should reject more than 100 items", () => {
    expect(messages("KeyValue", { items: Array.from({ length: 101 }, () => ({ label: "a", value: 1 })) })).not.toEqual([]);
  });
});

describe("Steps props", () => {
  it("should accept steps with optional body and code", () => {
    expect(messages("Steps", { title: "Deploy", items: [{ title: "One" }, { title: "Two", body: "**bold**", code: "ls", language: "sh" }] })).toEqual([]);
  });

  it("should name the step when its title is missing", () => {
    expect(messages("Steps", { items: [{ body: "no title" }] }).join("\n")).toContain("props.items[0].title");
  });

  it("should reject more than 50 steps", () => {
    expect(messages("Steps", { items: Array.from({ length: 51 }, () => ({ title: "x" })) })).not.toEqual([]);
  });
});
