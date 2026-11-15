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

/** The message for a spec with `count` bound Inputs and one Link whose address is read from state. */
function messageWith(count: number): string {
  const keys = Array.from({ length: count }, (_, index) => `field-${String(index + 1)}`);
  const fields = Object.fromEntries(keys.map((key) => [key, { type: "Input", props: { label: key, value: { $bindState: `/${key}` } } }]));
  const elements = { page: { type: "Stack", props: {}, children: [...keys, "go"] }, ...fields, go: { type: "Link", props: { label: "Go", href: { $state: "/url" } } } };
  const state = { url: "https://example.com", ...Object.fromEntries(keys.map((key) => [key, ""])) };
  const found = validateUiSpec({ version: 1, root: "page", state, elements }).issues.filter((issue) => issue.code === "typed_text_in_link");
  expect(found).toHaveLength(1);
  return found[0]?.message ?? "";
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

  it("should name the one bound text field when a single field is bound", () => {
    const found = issuesOf(bound, { type: "Link", props: { label: "Go", href: { $state: "/url" } } });
    expect(found[0]?.message).toBe(
      'Element "other" (Link): `href` cannot use an expression in a spec whose text field "field" is bound to state, because text a reader types must never reach a link. Write `href` out in the spec, or remove the binding from the text field\'s `value`.',
    );
  });

  it.each([
    [2, 'text fields "field-1" and "field-2" are bound to state'],
    [3, 'text fields "field-1", "field-2", and "field-3" are bound to state'],
    [4, 'text fields "field-1", "field-2", "field-3", and 1 more are bound to state'],
    [9, 'text fields "field-1", "field-2", "field-3", and 6 more are bound to state'],
  ])("should name every bound text field, up to three and then how many more, when %i are bound", (count, words) => {
    const message = messageWith(count);
    expect(message).toContain(`in a spec whose ${words}, because`);
    expect(message).toContain("or remove the binding from each of those text fields' `value`.");
  });

  it("should name bound fields only, in the spec's order, and both kinds of text field", () => {
    const elements = {
      page: { type: "Stack", props: {}, children: ["notes", "plain", "email", "go"] },
      notes: { type: "Textarea", props: { label: "Notes", value: { $bindState: "/notes" } } },
      plain: { type: "Input", props: { label: "Plan", value: "Team" } },
      email: { type: "Input", props: { label: "Email", value: { $bindState: "/email" } } },
      go: { type: "Link", props: { label: "Go", href: { $state: "/url" } } },
    };
    const found = validateUiSpec({ version: 1, root: "page", state: { notes: "", email: "", url: "https://example.com" }, elements }).issues.filter((issue) => issue.code === "typed_text_in_link");
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('whose text fields "notes" and "email" are bound to state');
    expect(found[0]?.message).not.toContain('"plain"');
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
