import { describe, expect, it } from "vitest";

import { buildSynopsis, fileTypeLabel } from "@/lib/og/synopsis";
import { sketchFrom, uiSynopsis } from "@/lib/og/synopsis-ui";

const base = { language: "", files: [] };

function spec(elements: Record<string, unknown>, root = "page") {
  return JSON.stringify({ version: 1, root, elements });
}

describe("uiSynopsis", () => {
  it("should show the first three metrics and a sketch of the first chart when the spec has both", () => {
    const content = spec({
      page: { type: "Stack", children: ["m1", "m2", "chart", "m3", "m4"] },
      m1: { type: "Metric", props: { label: "Revenue", value: 1200, format: "currency" } },
      m2: { type: "Metric", props: { label: "Latency", value: 182, unit: "ms" } },
      chart: { type: "Chart", props: { type: "line", labels: ["a", "b", "c"], series: [{ name: "x", values: [3, 1, 2] }] } },
      m3: { type: "Metric", props: { label: "Status", value: "Green" } },
      m4: { type: "Metric", props: { label: "Ignored", value: 4 } },
    });
    expect(uiSynopsis(content)).toEqual({
      type: "metrics",
      metrics: [
        { label: "Revenue", value: "$1,200" },
        { label: "Latency", value: "182 ms" },
        { label: "Status", value: "Green" },
      ],
      sketch: { shape: "line", values: [1, 0, 0.5] },
    });
  });

  it("should fall back to the first table when there are no metrics or charts", () => {
    const content = spec({
      page: { type: "Stack", children: ["table"] },
      table: { type: "Table", props: { columns: [{ key: "name", label: "Name" }, { key: "n", label: "Count", format: "number" }], rows: [{ name: "a", n: 1000 }, { name: "b" }] } },
    });
    expect(uiSynopsis(content)).toEqual({ type: "table", header: ["Name", "Count"], rows: [["a", "1,000"], ["b", "—"]] });
  });

  it("should list component types when nothing else fits", () => {
    const content = spec({ page: { type: "Stack", children: ["h", "t"] }, h: { type: "Heading", props: { text: "x" } }, t: { type: "Text", props: { text: "y" } } });
    expect(uiSynopsis(content)).toEqual({ type: "components", names: ["Stack", "Heading", "Text"] });
  });

  it("should skip metrics whose values are expressions when the spec binds state", () => {
    const content = spec({ page: { type: "Metric", props: { label: "Bound", value: { $state: "/x" } } } });
    expect(uiSynopsis(content)).toEqual({ type: "components", names: ["Metric"] });
  });

  it("should survive cycles and return null when the content is not JSON", () => {
    expect(uiSynopsis(spec({ page: { type: "Stack", children: ["page"] } }))).toEqual({ type: "components", names: ["Stack"] });
    expect(uiSynopsis("not json")).toBeNull();
  });
});

describe("sketchFrom", () => {
  it("should return null when there are fewer than two points", () => {
    expect(sketchFrom([1], "bar")).toBeNull();
  });

  it("should scale bars from zero when every value is positive", () => {
    expect(sketchFrom([5, 10], "bar")).toEqual({ shape: "bar", values: [0.5, 1] });
  });
});

describe("buildSynopsis", () => {
  it("should show the first heading and plain text when the artifact is Markdown", () => {
    const synopsis = buildSynopsis({ ...base, kind: "markdown", content: "# Plan\n\nShip **it** [now](https://x.dev).\n\n```\nsecret()\n```" });
    expect(synopsis).toEqual({ type: "prose", heading: "Plan", body: "Ship it now." });
  });

  it("should show the header and up to four rows with at most four columns when the artifact is CSV", () => {
    const synopsis = buildSynopsis({ ...base, kind: "csv", content: "a,b,c,d,e\n1,2,3,4,5\n6,7,8,9,10\n" });
    expect(synopsis).toEqual({ type: "table", header: ["a", "b", "c", "d"], rows: [["1", "2", "3", "4"], ["6", "7", "8", "9"]] });
  });

  it("should show up to eight lines of code with its language when the artifact is code", () => {
    const content = `\n\n${Array.from({ length: 12 }, (_, index) => `line ${String(index)}`).join("\n")}`;
    const synopsis = buildSynopsis({ ...base, kind: "code", content, language: "python" });
    expect(synopsis).toMatchObject({ type: "code", language: "python" });
    expect(synopsis.type === "code" ? synopsis.lines : []).toHaveLength(8);
    expect(synopsis.type === "code" ? synopsis.lines[0] : "").toBe("line 0");
  });

  it("should pretty-print JSON when the artifact is JSON", () => {
    expect(buildSynopsis({ ...base, kind: "json", content: '{"a":1}' })).toEqual({ type: "code", language: "JSON", lines: ["{", '  "a": 1', "}"] });
  });

  it("should never read SVG markup when the artifact is an SVG", () => {
    expect(buildSynopsis({ ...base, kind: "svg", content: "<svg><script>alert(1)</script></svg>" })).toEqual({ type: "glyph", glyph: "vector", label: "Vector image", detail: null });
  });

  it("should name the diagram type when the artifact is Mermaid", () => {
    expect(buildSynopsis({ ...base, kind: "mermaid", content: "%% note\nsequenceDiagram\n A->>B: hi" })).toMatchObject({ glyph: "diagram", detail: "Sequence diagram" });
  });

  it("should show the first file's name and type when the artifact holds files", () => {
    const files = [{ filename: "report.pdf", contentType: "application/pdf" }, { filename: "a.png", contentType: "image/png" }];
    expect(buildSynopsis({ ...base, kind: "file", content: "", files })).toEqual({ type: "glyph", glyph: "file", label: "report.pdf", detail: "PDF · 2 files" });
  });
});

describe("fileTypeLabel", () => {
  it("should name media by extension and family", () => {
    expect(fileTypeLabel({ filename: "shot.PNG", contentType: "image/png" })).toBe("PNG image");
  });

  it("should fall back to the subtype when there is no extension", () => {
    expect(fileTypeLabel({ filename: "notes", contentType: "text/plain" })).toBe("PLAIN");
  });
});
