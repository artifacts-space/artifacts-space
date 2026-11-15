import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isBlocking } from "./issues";
import { validateUiSpec } from "./validate";
import { linkCarryingProps } from "./validate-fields";

const bound = { type: "Input", props: { label: "Name", value: { $bindState: "/name" } } };
const plain = { type: "Input", props: { label: "Name", value: "Maya" } };

function issuesOf(field: { type: string; props: Record<string, unknown> }, other: { type: string; props: Record<string, unknown> }) {
  const spec = { version: 1, root: "page", state: { name: "", url: "https://example.com", items: [] }, elements: { page: { type: "Stack", props: {}, children: ["field", "other"] }, field, other } };
  return validateUiSpec(spec).issues.filter((issue) => issue.code === "typed_text_in_link");
}

const carriers: [string, { type: string; props: Record<string, unknown> }][] = [
  ["a Link address read from state", { type: "Link", props: { label: "Go", href: { $state: "/url" } } }],
  ["a Link address built from a template", { type: "Link", props: { label: "Go", href: { $template: "https://example.com/?q=${/name}" } } }],
  ["Markdown read from state", { type: "Markdown", props: { content: { $template: "[go](https://example.com/?q=${/name})" } } }],
  ["a Steps body read from state", { type: "Steps", props: { items: [{ title: "One", body: { $state: "/name" } }] } }],
  ["Steps items read from state", { type: "Steps", props: { items: { $state: "/items" } } }],
  ["Diagram code read from state", { type: "Diagram", props: { code: { $state: "/name" } } }],
];

describe("typed text never reaches a link", () => {
  it.each(carriers)("should stop the whole spec when a text field is bound and the spec has %s", (_name, other) => {
    const found = issuesOf(bound, other);
    expect(found).toHaveLength(1);
    expect(found[0]?.elementKey).toBe("other");
    expect(found[0] ? isBlocking(found[0]) : false).toBe(true);
    expect(found[0]?.message).toContain("text a reader types must never reach a link");
  });

  it("should stop the spec when the bound field is a Textarea", () => {
    const area = { type: "Textarea", props: { label: "Notes", value: { $bindState: "/name" } } };
    expect(issuesOf(area, { type: "Link", props: { label: "Go", href: { $state: "/url" } } })).toHaveLength(1);
  });

  it.each(carriers)("should allow %s when no text field is bound, as before text fields existed", (_name, other) => {
    expect(issuesOf(plain, other)).toEqual([]);
  });

  it("should allow a bound text field beside links and Markdown that are written in the spec", () => {
    expect(issuesOf(bound, { type: "Link", props: { label: "Docs", href: "https://example.com/docs" } })).toEqual([]);
    expect(issuesOf(bound, { type: "Markdown", props: { content: "[docs](https://example.com/docs)" } })).toEqual([]);
  });

  it("should allow typed text in plain Text, which never becomes a link", () => {
    expect(issuesOf(bound, { type: "Text", props: { text: { $template: "Hello ${/name}" } } })).toEqual([]);
  });

  it("should name every component whose view renders Markdown, a link, or a diagram, so a new one cannot be missed", () => {
    const viewDir = join(process.cwd(), "src/components/artifact-view/ui");
    const marks = /<MarkdownView|<ExternalLink|<MermaidView|<a\s|href=\{/;
    const files = readdirSync(viewDir).filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx") && marks.test(readFileSync(join(viewDir, name), "utf8")));
    // content.tsx: Markdown and Link. steps.tsx: Steps. data.tsx: Diagram. media.tsx: a File download, whose address comes from an attached file's id.
    expect(files.sort()).toEqual(["content.tsx", "data.tsx", "media.tsx", "steps.tsx"]);
    expect(Object.keys(linkCarryingProps).sort()).toEqual(["Diagram", "Link", "Markdown", "Steps"]);
  });
});
