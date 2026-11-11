import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

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
