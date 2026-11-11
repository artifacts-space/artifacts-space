import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { parseFenceInfo, withFenceAttributes } from "@/lib/markdown/fence-info";
import { isMermaidLanguage } from "@/lib/markdown/mermaid-fence";

import { blockCorpus } from "./block-corpus";
import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

/** The corpus's mermaid samples; fails loudly when the entry is missing, so no test passes on an empty string. */
function mermaidSamples(): Readonly<Record<string, string>> {
  const samples = blockCorpus.mermaid?.samples;
  if (!samples || Object.keys(samples).length === 0) throw new Error("block-corpus.ts has no mermaid samples");
  return samples;
}

const samples = mermaidSamples();

/** One sample by name; fails loudly when it was renamed or removed. */
function sample(name: string): string {
  const markdown = samples[name];
  if (markdown === undefined) throw new Error(`block-corpus.ts has no mermaid sample named ${name}`);
  return markdown;
}

function codeBlocks(doc: JSONContent): JSONContent[] {
  return (doc.content ?? []).flatMap((node) => (node.type === "codeBlock" ? [node] : codeBlocks(node)));
}

describe("Mermaid blocks in the editor model", () => {
  it.each(Object.entries(samples))("should load %s as a code block with the mermaid language", (_name, markdown) => {
    const blocks = codeBlocks(parseMarkdown(markdown).doc);
    expect(blocks).toHaveLength(1);
    expect(isMermaidLanguage(blocks[0]?.attrs?.language)).toBe(true);
  });

  it("should write exactly the fenced block when the diagram source is edited", () => {
    const loaded = parseMarkdown(sample("mermaidFlowchart"));
    const content = (loaded.doc.content ?? []).map((node) =>
      node.type === "codeBlock" ? { ...node, content: [{ type: "text", text: "flowchart LR\n  A --> B" }] } : node,
    );
    expect(serializeMarkdown({ type: "doc", content }, loaded.source)).toBe("Intro.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nOutro.\n");
  });

  it("should keep a broken diagram's source as written when it is not edited", () => {
    const markdown = sample("mermaidBroken");
    const loaded = parseMarkdown(markdown);
    expect(loaded.rawBlocks).toBe(0);
    expect(serializeMarkdown(loaded.doc, loaded.source)).toBe(markdown);
  });

  it("should write a longer fence when the diagram source holds a fence", () => {
    const loaded = parseMarkdown("Intro\n");
    const block = { type: "codeBlock", attrs: { language: "mermaid" }, content: [{ type: "text", text: "flowchart TD\n  A[\"```\"] --> B\n```" }] };
    const output = serializeMarkdown({ type: "doc", content: [block] }, loaded.source);
    expect(output).toBe("````mermaid\nflowchart TD\n  A[\"```\"] --> B\n```\n````\n");
  });
});

/** The document with each code block's info string passed through `change`, as the editor's pickers do. */
function withInfo(doc: JSONContent, change: (info: string) => string): JSONContent {
  const visit = (node: JSONContent): JSONContent => {
    if (node.type === "codeBlock") {
      const info: unknown = node.attrs?.language;
      return { ...node, attrs: { ...node.attrs, language: change(typeof info === "string" ? info : "") || null } };
    }
    return node.content ? { ...node, content: node.content.map(visit) } : node;
  };
  return visit(doc);
}

/** Loads `markdown`, applies `change` to its code blocks, and saves it. */
function saveWith(markdown: string, change: (info: string) => string): string {
  const loaded = parseMarkdown(markdown);
  return serializeMarkdown(withInfo(loaded.doc, change), loaded.source);
}

describe("Mermaid views and captions in the editor model", () => {
  it.each([
    ["mermaidViewCode", "code"],
    ["mermaidViewPreview", "preview"],
    ["mermaidViewSplit", "split"],
    ["mermaidSplitCaption", "split"],
  ] as const)("should load %s with the %s view", (name, view) => {
    const [block] = codeBlocks(parseMarkdown(sample(name)).doc);
    expect(parseFenceInfo(block?.attrs?.language).view).toBe(view);
  });

  it("should keep a caption's escaped quotes and backslashes when it loads", () => {
    const [block] = codeBlocks(parseMarkdown(sample("mermaidSplitCaption")).doc);
    expect(parseFenceInfo(block?.attrs?.language)).toEqual({ language: "mermaid", view: "split", caption: 'Say "ship" at C:\\', wrap: false });
  });

  it("should ignore an unknown view and keep it as written when it loads", () => {
    const markdown = sample("mermaidUnknownAttribute");
    const loaded = parseMarkdown(markdown);
    const [block] = codeBlocks(loaded.doc);
    expect(parseFenceInfo(block?.attrs?.language).view).toBeNull();
    expect(serializeMarkdown(loaded.doc, loaded.source)).toBe(markdown);
  });

  it.each(["code", "split"] as const)("should write view=%s on the fence when the view is picked", (view) => {
    expect(saveWith(sample("mermaidFlowchart"), (info) => withFenceAttributes(info, { view }))).toBe(
      `Intro.\n\n\`\`\`mermaid {view=${view}}\nflowchart TD\n  A[Agent writes] --> B{Reviewed?}\n  B -->|Yes| C[Publish]\n  B -->|No| A\n\`\`\`\n\nOutro.\n`,
    );
  });

  it("should drop the view from the fence when Preview, the default, is picked", () => {
    expect(saveWith(sample("mermaidViewSplit"), (info) => withFenceAttributes(info, { view: null }))).toBe("```mermaid\nflowchart LR\n  A --> B\n```\n");
  });

  it("should write the caption on the fence and keep the view when a caption is added", () => {
    expect(saveWith(sample("mermaidViewSplit"), (info) => withFenceAttributes(info, { caption: 'The "release" flow' }))).toBe('```mermaid {view=split caption="The \\"release\\" flow"}\nflowchart LR\n  A --> B\n```\n');
  });

  it("should keep unknown attributes when the view changes", () => {
    expect(saveWith(sample("mermaidUnknownAttribute"), (info) => withFenceAttributes(info, { view: "code" }))).toBe("```mermaid {view=code zoom=2}\nflowchart LR\n  A --> B\n```\n");
  });

  it("should switch to a tilde fence when a caption holds a backtick", () => {
    expect(saveWith(sample("mermaidViewCode"), (info) => withFenceAttributes(info, { caption: "Uses `graph`" }))).toBe('~~~mermaid {view=code caption="Uses `graph`"}\nflowchart LR\n  A --> B\n~~~\n');
  });

  it("should keep the attributes when the diagram source is edited", () => {
    const loaded = parseMarkdown(sample("mermaidSplitCaption"));
    const content = (loaded.doc.content ?? []).map((node) => (node.type === "codeBlock" ? { ...node, content: [{ type: "text", text: "flowchart LR\n  A --> C" }] } : node));
    expect(serializeMarkdown({ type: "doc", content }, loaded.source)).toBe('Intro.\n\n```mermaid {view=split caption="Say \\"ship\\" at C:\\\\"}\nflowchart LR\n  A --> C\n```\n\nOutro.\n');
  });
});
