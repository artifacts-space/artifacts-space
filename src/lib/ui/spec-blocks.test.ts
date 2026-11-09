import { describe, expect, it } from "vitest";

import { validateArtifactContent } from "@/lib/artifact-content";

import { blockTemplates, matchTemplates, textLimit } from "./block-templates";
import { containerComponents, isUiComponentName } from "./catalog";
import {
  childrenOf,
  deleteBlock,
  duplicateBlock,
  insertBlock,
  moveBlock,
  nudgeBlock,
  placeOf,
  propsOf,
  readRawSpec,
  replaceBlock,
  setProp,
  withContainerRoot,
  writeRawSpec,
  type RawSpec,
} from "./spec-blocks";

const page = (): RawSpec => {
  const spec = readRawSpec(JSON.stringify({
    version: 1,
    root: "page",
    state: { open: true },
    elements: {
      page: { type: "Stack", props: {}, children: ["title", "intro", "tabs"] },
      title: { type: "Heading", props: { text: "Launch", level: 1 } },
      intro: { type: "Text", props: { text: "Plan." } },
      tabs: { type: "Tabs", props: { tabs: [{ label: "One" }, { label: "Two" }] }, children: ["one", "two"] },
      one: { type: "Card", props: { title: "First" }, children: ["one-text"] },
      "one-text": { type: "Text", props: { text: "Inside" } },
      two: { type: "Text", props: { text: "Second" } },
    },
  }));
  if (!spec) throw new Error("fixture");
  return spec;
};

/** Errors the shared content check (artifacts_validate) reports for a spec. */
const errorsOf = (spec: RawSpec) => validateArtifactContent("ui", writeRawSpec(spec)).issues.filter((issue) => issue.severity === "error");

describe("readRawSpec", () => {
  it("should keep every top-level field when the content is a spec", () => {
    expect(page().state).toEqual({ open: true });
  });

  it("should refuse content that is not a spec with a root and elements", () => {
    expect(readRawSpec("not json")).toBeNull();
    expect(readRawSpec(JSON.stringify({ root: "a" }))).toBeNull();
    expect(readRawSpec(JSON.stringify({ root: "a", elements: { a: { props: {} } } }))).toBeNull();
  });
});

describe("setProp", () => {
  it("should change one prop and leave the input spec untouched", () => {
    const before = page();
    const after = setProp(before, "title", "text", "Launch day");
    expect(propsOf(after, "title")).toEqual({ text: "Launch day", level: 1 });
    expect(propsOf(before, "title").text).toBe("Launch");
  });

  it("should remove a prop when the value is undefined", () => {
    expect(propsOf(setProp(page(), "title", "level", undefined), "title")).toEqual({ text: "Launch" });
  });
});

describe("moveBlock and nudgeBlock", () => {
  it("should reorder siblings when a block is dragged down past its neighbour", () => {
    expect(childrenOf(moveBlock(page(), "title", "page", 2) ?? page(), "page")).toEqual(["intro", "title", "tabs"]);
  });

  it("should move a block up and down one place, and refuse past either end", () => {
    expect(childrenOf(nudgeBlock(page(), "intro", -1) ?? page(), "page")).toEqual(["intro", "title", "tabs"]);
    expect(childrenOf(nudgeBlock(page(), "intro", 1) ?? page(), "page")).toEqual(["title", "tabs", "intro"]);
    expect(nudgeBlock(page(), "title", -1)).toBeNull();
  });

  it("should refuse to move a block into itself or anything under it", () => {
    expect(moveBlock(page(), "tabs", "one", 0)).toBeNull();
    expect(moveBlock(page(), "page", "one", 0)).toBeNull();
  });

  it("should keep tab labels paired with their panels when a panel moves", () => {
    const moved = nudgeBlock(page(), "two", -1) ?? page();
    expect(childrenOf(moved, "tabs")).toEqual(["two", "one"]);
    expect(propsOf(moved, "tabs").tabs).toEqual([{ label: "Two" }, { label: "One" }]);
    expect(errorsOf(moved)).toEqual([]);
  });

  it("should take the tab label away when a panel moves out of the tabs, and add one when a block moves in", () => {
    const out = moveBlock(page(), "two", "page", 0) ?? page();
    expect(propsOf(out, "tabs").tabs).toEqual([{ label: "One" }]);
    const back = moveBlock(out, "intro", "tabs", 1) ?? out;
    expect(propsOf(back, "tabs").tabs).toEqual([{ label: "One" }, { label: "New tab" }]);
    expect(errorsOf(back)).toEqual([]);
  });
});

describe("duplicateBlock", () => {
  it("should copy a block and everything under it right after it, under fresh keys", () => {
    const result = duplicateBlock(page(), "one");
    expect(result).not.toBeNull();
    if (!result) return;
    expect(childrenOf(result.spec, "tabs")).toEqual(["one", result.key, "two"]);
    const copiedChild = childrenOf(result.spec, result.key)[0];
    expect(copiedChild).toBeDefined();
    expect(copiedChild).not.toBe("one-text");
    expect(propsOf(result.spec, copiedChild ?? "").text).toBe("Inside");
    expect(propsOf(result.spec, "tabs").tabs).toEqual([{ label: "One" }, { label: "One" }, { label: "Two" }]);
    expect(errorsOf(result.spec)).toEqual([]);
  });

  it("should refuse to duplicate the root", () => {
    expect(duplicateBlock(page(), "page")).toBeNull();
  });
});

describe("deleteBlock", () => {
  it("should remove a block with its subtree and its tab label, leaving a valid spec", () => {
    const after = deleteBlock(page(), "one");
    expect(after).not.toBeNull();
    if (!after) return;
    expect(after.elements.one).toBeUndefined();
    expect(after.elements["one-text"]).toBeUndefined();
    expect(childrenOf(after, "tabs")).toEqual(["two"]);
    expect(propsOf(after, "tabs").tabs).toEqual([{ label: "Two" }]);
    expect(errorsOf(after)).toEqual([]);
  });

  it("should never delete the root", () => {
    expect(deleteBlock(page(), "page")).toBeNull();
  });

  it("should leave a spec the shared check refuses when the last tab is deleted, so the editor keeps the old one", () => {
    const once = deleteBlock(page(), "one") ?? page();
    const twice = deleteBlock(once, "two") ?? once;
    expect(errorsOf(twice).length).toBeGreaterThan(0);
  });
});

describe("insertBlock and replaceBlock", () => {
  it("should add a block with its child blocks at the index under the parent", () => {
    const tabs = blockTemplates.find((template) => template.id === "tabs");
    const result = tabs ? insertBlock(page(), "page", 1, tabs.create()) : null;
    expect(result).not.toBeNull();
    if (!result) return;
    expect(childrenOf(result.spec, "page")[1]).toBe(result.key);
    expect(childrenOf(result.spec, result.key)).toHaveLength(2);
    expect(errorsOf(result.spec)).toEqual([]);
  });

  it("should turn an empty line into another block in the same place", () => {
    const heading = blockTemplates.find((template) => template.id === "heading-2");
    const after = heading ? replaceBlock(page(), "intro", heading.create()) : null;
    expect(after?.elements.intro?.type).toBe("Heading");
    expect(placeOf(after ?? page(), "intro")).toEqual({ parent: "page", index: 1 });
  });

  it("should wrap a single-block root in a stack so more blocks can be added", () => {
    const single = readRawSpec(JSON.stringify({ version: 1, root: "only", elements: { only: { type: "Heading", props: { text: "Hi" } } } }));
    if (!single) throw new Error("fixture");
    const wrapped = withContainerRoot(single, (type) => isUiComponentName(type) && containerComponents.has(type));
    expect(wrapped.elements[wrapped.root]?.type).toBe("Stack");
    expect(childrenOf(wrapped, wrapped.root)).toEqual(["only"]);
    expect(errorsOf(wrapped)).toEqual([]);
  });
});

describe("blockTemplates", () => {
  it.each(blockTemplates.map((template) => [template.id, template] as const))("should insert a valid %s block", (_id, template) => {
    const result = insertBlock(page(), "page", 0, template.create());
    expect(result).not.toBeNull();
    if (result) expect(errorsOf(result.spec)).toEqual([]);
  });

  it("should put label matches first when filtering the insert menu", () => {
    expect(matchTemplates("head").map((template) => template.id).slice(0, 3)).toEqual(["heading-1", "heading-2", "heading-3"]);
    expect(matchTemplates("kanban").map((template) => template.id)).toEqual(["board"]);
    expect(matchTemplates("")).toHaveLength(blockTemplates.length);
  });
});

describe("textLimit", () => {
  it("should read the longest text a prop takes from its schema, optional or not", () => {
    expect(textLimit("Heading", "text")).toBe(200);
    expect(textLimit("Callout", "title")).toBe(160);
    expect(textLimit("Heading", "level")).toBeUndefined();
  });
});
