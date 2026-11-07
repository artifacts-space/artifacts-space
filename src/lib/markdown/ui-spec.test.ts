import { describe, expect, it } from "vitest";

import { uiComponentNames } from "@/lib/ui/catalog";
import { componentFixtures, fixtureSpec } from "@/lib/ui/fixtures/components";
import { exampleUiSpec } from "@/lib/ui/fixtures/example";

import { joinBlocks, uiSpecToMarkdown } from "./ui-spec";

type Elements = Record<string, { type: string; props: Record<string, unknown>; children?: string[]; repeat?: unknown; visible?: unknown }>;

/** A spec whose root Stack holds `top` (default: every element). */
function spec(elements: Elements, state?: Record<string, unknown>, top: string[] = Object.keys(elements)) {
  const children = top;
  return JSON.stringify({ version: 1, root: "page", ...(state ? { state } : {}), elements: { page: { type: "Stack", props: {}, children }, ...elements } });
}

describe("uiSpecToMarkdown", () => {
  it("should write headings, metrics as bullets, a chart as its data table, and checklists as task lists when given the reference example", () => {
    const markdown = uiSpecToMarkdown(JSON.stringify(exampleUiSpec));
    expect(markdown).toContain("## Release 2.4 readiness");
    expect(markdown).toContain("- **Tests passing:** 98.6% (+1.2)\n- **Open bugs:** 7 (-3)\n- **p95 latency:** 182 ms (-14)");
    expect(markdown).toContain("**Open bugs by week** (line chart)");
    expect(markdown).toContain("| Label | Open bugs |\n| --- | --- |\n| W1 | 21 |");
    expect(markdown).toContain("- [x] Fix flaky upload test\n- [ ] Update the migration guide");
  });

  it("should resolve state bindings when a prop reads the spec's state", () => {
    const markdown = uiSpecToMarkdown(JSON.stringify(exampleUiSpec));
    expect(markdown).toContain("- **Show remaining work:** off");
  });

  it("should still write content that a state condition hides on the page when rendering for a reader without controls", () => {
    expect(uiSpecToMarkdown(JSON.stringify(exampleUiSpec))).toContain("## Remaining work\n\n- [x] Fix flaky upload test");
  });

  it("should render a GitHub table with formatted cells and escaped pipes when given a Table", () => {
    const markdown = uiSpecToMarkdown(
      spec({ t: { type: "Table", props: { caption: "Costs", columns: [{ key: "a", label: "Item|name" }, { key: "b", label: "Cost", format: "currency" }], rows: [{ a: "x", b: 1.5 }, { a: "y", b: 20 }, { a: null, b: null }] } } }),
    );
    expect(markdown).toBe("**Costs**\n\n| Item\\|name | Cost |\n| --- | --- |\n| x | $1.50 |\n| y | $20.00 |\n| — | — |");
  });

  it("should put each tab under its own heading when given Tabs", () => {
    const markdown = uiSpecToMarkdown(spec({ tabs: { type: "Tabs", props: { tabs: [{ label: "One" }, { label: "Two" }] }, children: ["a", "b"] }, a: { type: "Text", props: { text: "First" } }, b: { type: "Text", props: { text: "Second" } } }, undefined, ["tabs"]));
    expect(markdown).toContain("## One\n\nFirst\n\n## Two\n\nSecond");
  });

  it("should expand a repeat once per item when an element repeats over state", () => {
    const markdown = uiSpecToMarkdown(
      spec({ list: { type: "Stack", props: {}, repeat: { statePath: "/todos" }, children: ["item"] }, item: { type: "Text", props: { text: { $item: "title" } } } }, { todos: [{ title: "Ship it" }, { title: "Write docs" }] }, ["list"]),
    );
    expect(markdown).toContain("Ship it\n\nWrite docs");
  });

  it("should write a scatter chart as series, label, x, and y columns", () => {
    const markdown = uiSpecToMarkdown(spec({ c: { type: "Chart", props: { type: "scatter", xLabel: "Cost", series: [{ name: "Runs", points: [{ x: 1, y: 2, label: "a" }] }] } } }));
    expect(markdown).toContain("| Series | Label | Cost | y |\n| --- | --- | --- | --- |\n| Runs | a | 1 | 2 |");
  });

  it("should fence code, diagrams, and callouts when given those components", () => {
    const markdown = uiSpecToMarkdown(
      spec({
        code: { type: "Code", props: { code: "pnpm check", language: "bash", title: "Run" } },
        diagram: { type: "Diagram", props: { code: "graph TD; A-->B" } },
        callout: { type: "Callout", props: { text: "Back up first.", title: "Careful", tone: "warning" } },
      }),
    );
    expect(markdown).toContain("**Run**\n\n```bash\npnpm check\n```");
    expect(markdown).toContain("```mermaid\ngraph TD; A-->B\n```");
    expect(markdown).toContain("> [!WARNING]\n> **Careful**\n> Back up first.");
  });

  it("should link an image to its file when the reader may see it, and say so when not", () => {
    const fileId = "7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a";
    const content = spec({ img: { type: "Image", props: { file: fileId, alt: "Chart", caption: "Week 1" } } });
    const linked = uiSpecToMarkdown(content, { fileLink: (id) => (id === fileId ? { name: "chart.png", url: "https://artifacts.space/api/files/x" } : null) });
    expect(linked).toBe("![Chart](https://artifacts.space/api/files/x)\n\n_Week 1_");
    expect(uiSpecToMarkdown(content)).toContain("_Image: Chart (not available)_");
  });

  it("should write every catalog component without the not-shown note when given its fixtures", () => {
    for (const name of uiComponentNames) {
      const fixture = componentFixtures[name][0];
      if (!fixture) continue;
      const markdown = uiSpecToMarkdown(JSON.stringify(fixtureSpec(name, fixture)));
      expect(markdown, name).not.toContain("not shown in Markdown");
      expect(markdown, name).not.toContain("could not be read");
    }
  });

  it("should fall back to the JSON source when the spec cannot be read", () => {
    const markdown = uiSpecToMarkdown("{ not json");
    expect(markdown).toContain("could not be read");
    expect(markdown).toContain("```json\n{ not json\n```");
  });
});

describe("joinBlocks", () => {
  it("should keep consecutive bullet blocks in one tight list and separate everything else with blank lines", () => {
    expect(joinBlocks(["# A", "- one", "- two", "text", "", "1. x"])).toBe("# A\n\n- one\n- two\n\ntext\n\n1. x");
  });
});
