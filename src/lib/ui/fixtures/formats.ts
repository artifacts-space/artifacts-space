import { exampleUiSpec } from "./example";
import { longText } from "./components";

/** One sample of artifact content for the format viewers. */
export interface FormatFixture {
  name: string;
  kind: string;
  content: string;
  language?: string;
}

const csvRows = ["id,name,amount,notes", ...Array.from({ length: 1500 }, (_, index) => `${String(index + 1)},Item ${String(index + 1)},${String((index * 7919) % 10_000)},"note, with comma"`)].join("\n");

/** A sheet at the viewer's size limit (csv-limits.ts): 1,000 rows by 50 columns. */
export function sheetAtLimit(): string {
  const columns = Array.from({ length: 50 }, (_, column) => `col_${String(column + 1).padStart(2, "0")}`);
  return [columns.join(","), ...Array.from({ length: 1000 }, (_, row) => columns.map((_, column) => `r${String(row + 1)}c${String(column + 1)}`).join(","))].join("\n");
}

/** Normal and extreme samples for every artifact format. */
export const formatFixtures: FormatFixture[] = [
  { name: "Markdown", kind: "markdown", content: "# Release plan\n\nShip **2.4** on Friday. See [the board](https://example.com).\n\n## Steps\n\n1. Freeze main\n2. Tag\n\n- [x] Notes written\n- [ ] Announce\n\n> Keep it small.\n\n```ts\nconst ok = true;\n```\n\n| Owner | Task |\n|---|---|\n| Ada | Tag |\n\n<script>alert('raw html is skipped')</script>\n\n[javascript link](javascript:alert(1)) ![tracking pixel](https://example.com/p.gif)" },
  { name: "Markdown, long", kind: "markdown", content: `${longText(4000)}\n\n${"x".repeat(400)}` },
  { name: "Code", kind: "code", language: "typescript", content: "export function greet(name: string) {\n  return `Hello, ${name}`;\n}\n" },
  { name: "Text", kind: "text", content: `Plain text keeps\n  its spacing.\n\n${longText(600)}` },
  { name: "JSON", kind: "json", content: '{"name":"artifacts","tags":["agents","mcp"],"nested":{"ok":true,"count":3}}' },
  { name: "JSON, invalid", kind: "json", content: '{ "name": "artifacts", tags: [1, 2 }' },
  { name: "CSV", kind: "csv", content: 'team,spend,notes\nPlatform,12840,"Includes ""reserved"" capacity"\nWeb,5300,\nData,,"Multi\nline note"' },
  { name: "CSV, 1,500 rows", kind: "csv", content: csvRows },
  { name: "Sheet at the size limit", kind: "csv", content: sheetAtLimit() },
  { name: "CSV, ragged and unclosed", kind: "csv", content: 'a,b\n1,2,3,4\n5\n"open quote,6' },
  { name: "SVG", kind: "svg", content: '<svg viewBox="0 0 120 60"><rect x="4" y="4" width="112" height="52" rx="8" fill="#2a78d6"/><text x="60" y="36" text-anchor="middle" font-size="16" fill="#fff">SVG</text></svg>' },
  { name: "SVG with script (inert)", kind: "svg", content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" onload="alert(1)"><script>alert(2)</script><circle cx="20" cy="20" r="16" fill="#eb6834"/><text x="44" y="25" font-size="12">inert</text></svg>' },
  { name: "SVG, invalid", kind: "svg", content: "<div>not an svg</div>" },
  { name: "Mermaid", kind: "mermaid", content: "flowchart LR\n  Agent -->|artifacts_create| MCP --> DB[(Neon)]\n  MCP --> Viewer" },
  { name: "Mermaid, invalid", kind: "mermaid", content: "this is not mermaid" },
  { name: "Interface", kind: "ui", content: JSON.stringify(exampleUiSpec) },
  { name: "Interface, invalid JSON", kind: "ui", content: '{"version":1,"root":' },
  { name: "Empty", kind: "markdown", content: "   " },
  { name: "Files", kind: "file", content: "Notes for the **2.4** release: the diagram, the report, and the spec." },
  { name: "Files, no notes", kind: "file", content: "" },
];
