import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { listCorpus } from "./list-corpus";
import { generatedLists, listEdits, seeded, type Random } from "./list-generator";
import { readsTheSame } from "./markdown-display-shape";
import { wholeListWriting } from "./list-edit-helpers";
import { parseMarkdown, serializeMarkdown } from "./markdown-roundtrip";

/*
 * The rule for every edit to a list: what is saved is either the list
 * written over its loaded source, item by item, and then it reads back as
 * the edit in the editor and in the read view; or it is exactly what the
 * round trip's own writer makes of the edited list, whole, as it did before
 * item maps existed (the reference here: the same save with the item maps
 * taken away). Nothing else is ever saved.
 *
 * Checked on generated documents (list-generator.ts) and on the corpus
 * (list-corpus.ts), for every edit in `listEdits` alone and for three
 * edits made one after another. A document nobody edits is saved byte for
 * byte, and a document that loads formatted reads the same in the read
 * view. 3,000 seeds run here; 20,000 were run once with LIST_FUZZ_SEEDS,
 * with no failure.
 */

const textBlocks: ReadonlySet<string> = new Set(["paragraph", "heading"]);

function words(node: JSONContent): string {
  if (node.type === "hardBreak") return " ";
  return node.text ?? (node.content ?? []).map((child) => words(child)).join("");
}

/** The content as Markdown can store it: blocks, list numbers, task boxes, and text without the spacing at the ends of its lines. */
function outline(node: JSONContent): unknown {
  if (textBlocks.has(node.type ?? "")) return { type: node.type, text: words(node).replace(/\s+/g, " ").trim() };
  if (node.type === "codeBlock") return { type: node.type, text: words(node) };
  const attrs: Record<string, unknown> = node.attrs ?? {};
  const start = node.type === "orderedList" ? (attrs.start ?? 1) : undefined;
  return { type: node.type, checked: attrs.checked, start, source: attrs.source, content: (node.content ?? []).map((child) => outline(child)) };
}

type Loaded = ReturnType<typeof parseMarkdown>;

/** What went wrong when the document loaded and was saved untouched, or nothing. */
function loadProblems(name: string, markdown: string, loaded: Loaded): string[] {
  const found: string[] = [];
  if (serializeMarkdown(structuredClone(loaded.doc), loaded.source) !== markdown) found.push(`${name}: saved differently with no edit`);
  if (loaded.rawBlocks === 0 && !readsTheSame(markdown, loaded.doc.content ?? [])) found.push(`${name}: loads formatted, but the page reads it differently\n${markdown}`);
  return found;
}

/** How one edit was saved. */
type Outcome = "whole" | "patched" | "wrong";

function outcomeOf(doc: JSONContent, loaded: Loaded): { outcome: Outcome; saved: string } {
  const saved = serializeMarkdown(doc, loaded.source);
  if (saved === wholeListWriting(doc, loaded.source)) return { outcome: "whole", saved };
  const again = parseMarkdown(saved);
  const sameInEditor = JSON.stringify(outline(again.doc)) === JSON.stringify(outline(doc));
  // A block kept as written has no outline to compare in the read view.
  const sameOnThePage = again.rawBlocks > 0 || readsTheSame(saved, again.doc.content ?? []);
  return { outcome: sameInEditor && sameOnThePage ? "patched" : "wrong", saved };
}

interface Tally {
  problems: string[];
  whole: number;
  patched: number;
}

/** Saves the edited document and counts how it was saved. */
function record(what: string, markdown: string, doc: JSONContent, loaded: Loaded, tally: Tally) {
  const { outcome, saved } = outcomeOf(doc, loaded);
  if (outcome === "wrong") tally.problems.push(`${what} is neither the whole-list writing nor a patch that reads back\n${markdown}---\n${saved}`);
  else tally[outcome] += 1;
}

const edits = Object.entries(listEdits);

/**
 * Three edits made one after another to one list, each saved with the
 * source the list loaded with, as the editor does while a person keeps
 * typing. The rule holds list by list, so the document is one list.
 */
function checkEditsInTurn(name: string, list: string, random: Random, tally: Tally) {
  const loaded = parseMarkdown(list);
  const doc = structuredClone(loaded.doc);
  const made: string[] = [];
  for (let step = 0; step < 3; step += 1) {
    const [edit, change] = edits[Math.floor(random() * edits.length)] ?? [];
    if (!edit || !change?.(doc, random)) continue;
    made.push(edit);
    record(`${name}: ${made.join(", then ")}`, list, doc, loaded, tally);
  }
}

/** Loads one document, saves it untouched, saves it after each edit, and saves its first block after edits made in turn. */
function check(name: string, markdown: string, random: Random, tally: Tally) {
  const loaded = parseMarkdown(markdown);
  tally.problems.push(...loadProblems(name, markdown, loaded));
  for (const [edit, change] of edits) {
    const doc = structuredClone(loaded.doc);
    if (change(doc, random)) record(`${name}: ${edit}`, markdown, doc, loaded, tally);
  }
  const first = loaded.source.blocks[0]?.text;
  if (first) checkEditsInTurn(name, `${first}\n`, random, tally);
}

describe("every edit to a list", () => {
  it("should save a patch that reads back as the edit, or the whole list as the round trip's own writer has it, on generated documents", { timeout: 3_600_000 }, () => {
    const tally: Tally = { problems: [], whole: 0, patched: 0 };
    for (let seed = Number(process.env.LIST_FUZZ_FROM ?? 1); seed <= Number(process.env.LIST_FUZZ_SEEDS ?? 3000); seed += 1) {
      const random = seeded(seed);
      check(`seed ${String(seed)}`, generatedLists(random), random, tally);
    }
    expect(tally.problems).toEqual([]);
    // Most edits fit in their items; if few did, the item maps would have stopped working.
    expect(tally.patched).toBeGreaterThan(tally.whole);
  });

  it("should save a patch that reads back as the edit, or the whole list as the round trip's own writer has it, on the corpus", () => {
    const tally: Tally = { problems: [], whole: 0, patched: 0 };
    for (const [name, markdown] of Object.entries(listCorpus)) {
      for (let round = 1; round <= 3; round += 1) check(name, markdown, seeded(round), tally);
    }
    expect(tally.problems).toEqual([]);
  });
});
