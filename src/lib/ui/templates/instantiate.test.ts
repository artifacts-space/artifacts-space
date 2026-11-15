import { describe, expect, it } from "vitest";

import { uiLimits } from "../limits";
import { validateUiSpec } from "../validate";

import { attachFragment, instantiateTemplate, templateAsSpec, templatePageKey } from "./instantiate";
import { TemplateError, templateBudget, type UiTemplate } from "./types";

/** A template that uses every place a key or a state path can appear. */
const sample: UiTemplate = {
  id: "hero-sample",
  name: "Sample",
  category: "hero",
  description: "A sample for the prefix tests.",
  viewport: "fluid",
  surface: "page",
  slots: [
    { what: "Headline", element: "title", prop: "text" },
    { what: "Rows", state: "/rows" },
  ],
  fragment: {
    root: "box",
    state: { open: true, name: "Ada", draft: "", rows: [{ id: "a", label: "First", done: false }], check: null },
    elements: {
      box: { type: "Box", props: { direction: "vertical" }, children: ["title", "switch", "list", "add", "check", "note"] },
      title: { type: "Heading", props: { text: { $template: "Hello ${/name}, ${/rows/0/label}" } }, visible: { $or: [{ $state: "/open" }, { $state: "/name", eq: { $state: "/draft" } }] } },
      switch: { type: "Switch", props: { label: "Open", checked: { $bindState: "/open" } }, on: { change: { action: "setState", params: { statePath: "/draft", value: { $state: "/name" } } } } },
      list: { type: "Box", props: {}, repeat: { statePath: "/rows", key: "id" }, children: ["row"] },
      row: { type: "Box", props: { direction: "horizontal" }, children: ["row-label", "row-done", "row-remove"] },
      "row-label": { type: "Text", props: { text: { $template: "${label} for ${/name}" } }, visible: { $item: "done", eq: false } },
      "row-done": { type: "Checkbox", props: { label: { $item: "label" }, checked: { $bindItem: "done" } } },
      "row-remove": { type: "Button", props: { label: "Remove" }, on: { press: { action: "removeState", params: { statePath: "/rows", index: { $index: true } } } } },
      add: { type: "Button", props: { label: "Add" }, on: { press: [{ action: "pushState", params: { statePath: "/rows", value: { id: "$id", label: { $state: "/draft" }, done: false }, clearStatePath: "/draft" } }] } },
      check: { type: "Button", props: { label: { $cond: { $state: "/open" }, $then: "Check", $else: { $state: "/name" } } }, on: { press: { action: "validateForm", params: { statePath: "/check" } } } },
      note: { type: "Text", props: { text: "Plain /text that starts with a slash stays as written." } },
    },
  },
};

describe("instantiateTemplate", () => {
  const instance = instantiateTemplate(sample, { prefix: "one" });

  it("should prefix every element key, the root, and each children list when a prefix is given", () => {
    expect(instance.root).toBe("one-box");
    expect(Object.keys(instance.elements)).toEqual(Object.keys(sample.fragment.elements).map((key) => `one-${key}`));
    expect(instance.elements["one-box"]?.children).toEqual(["one-title", "one-switch", "one-list", "one-add", "one-check", "one-note"]);
    expect(instance.elements["one-list"]?.children).toEqual(["one-row"]);
  });

  it("should move the state under one key, the prefix, when the template has state", () => {
    expect(instance.state).toEqual({ one: sample.fragment.state });
  });

  it("should prefix $state and $bindState in props when an element reads or binds state", () => {
    expect(instance.elements["one-switch"]?.props?.checked).toEqual({ $bindState: "/one/open" });
    expect(instance.elements["one-check"]?.props?.label).toEqual({ $cond: { $state: "/one/open" }, $then: "Check", $else: { $state: "/one/name" } });
  });

  it("should prefix each absolute reference in a $template and leave a bare item name when a string interpolates", () => {
    expect(instance.elements["one-title"]?.props?.text).toEqual({ $template: "Hello ${/one/name}, ${/one/rows/0/label}" });
    expect(instance.elements["one-row-label"]?.props?.text).toEqual({ $template: "${label} for ${/one/name}" });
  });

  it("should prefix state conditions in visible, nested ones and compared values too, and leave item conditions when an element is conditional", () => {
    expect(instance.elements["one-title"]?.visible).toEqual({ $or: [{ $state: "/one/open" }, { $state: "/one/name", eq: { $state: "/one/draft" } }] });
    expect(instance.elements["one-row-label"]?.visible).toEqual({ $item: "done", eq: false });
  });

  it("should prefix a repeat's statePath and keep its key when an element repeats", () => {
    expect(instance.elements["one-list"]?.repeat).toEqual({ statePath: "/one/rows", key: "id" });
  });

  it("should leave $item and $bindItem as written when an element reads the repeat's item", () => {
    expect(instance.elements["one-row-done"]?.props).toEqual({ label: { $item: "label" }, checked: { $bindItem: "done" } });
  });

  it("should prefix statePath, clearStatePath, and state values in action params when an element has on bindings", () => {
    expect(instance.elements["one-switch"]?.on).toEqual({ change: { action: "setState", params: { statePath: "/one/draft", value: { $state: "/one/name" } } } });
    expect(instance.elements["one-add"]?.on).toEqual({ press: [{ action: "pushState", params: { statePath: "/one/rows", value: { id: "$id", label: { $state: "/one/draft" }, done: false }, clearStatePath: "/one/draft" } }] });
    expect(instance.elements["one-row-remove"]?.on).toEqual({ press: { action: "removeState", params: { statePath: "/one/rows", index: { $index: true } } } });
    expect(instance.elements["one-check"]?.on).toEqual({ press: { action: "validateForm", params: { statePath: "/one/check" } } });
  });

  it("should leave plain text alone when it only looks like a path", () => {
    expect(instance.elements["one-note"]?.props?.text).toBe("Plain /text that starts with a slash stays as written.");
  });

  it("should point the slots at the prefixed keys and paths when a prefix is given", () => {
    expect(instance.slots).toEqual([{ what: "Headline", element: "one-title", prop: "text" }, { what: "Rows", state: "/one/rows" }]);
  });

  it("should use the template's id as the prefix when none is given", () => {
    expect(instantiateTemplate(sample).root).toBe("hero-sample-box");
  });

  it("should leave the template itself unchanged when it is instantiated", () => {
    const before = JSON.stringify(sample);
    instantiateTemplate(sample, { prefix: "two" });
    expect(JSON.stringify(sample)).toBe(before);
  });

  it.each(["", "One", "1st", "a b", "a_b", "-a", "a-", "a".repeat(41), "__proto__"])("should refuse the prefix %j when it is not lowercase words joined by hyphens", (prefix) => {
    expect(() => instantiateTemplate(sample, { prefix })).toThrow(TemplateError);
  });

  it.each(["constructor", "prototype"])("should refuse the prefix %j when the state key it makes is one the ui format rejects", (prefix) => {
    expect(() => instantiateTemplate(sample, { prefix })).toThrow(/would become a state key and state paths a ui spec cannot use/);
    // The format's own verdict on the same key, so the two cannot drift apart.
    const spec = templateAsSpec(sample, { prefix: "ok" });
    expect(validateUiSpec({ ...spec, state: { ...spec.state, [prefix]: {} } }).valid).toBe(false);
  });

  it.each(["constructor-2", "prototypes", "proto"])("should accept the prefix %j when it only contains such a word, and give a spec that validates", (prefix) => {
    expect(validateUiSpec(templateAsSpec(sample, { prefix })).issues).toEqual([]);
  });

  it("should keep the longest prefixed element key inside the ui format's key limit", () => {
    expect(templateBudget.maxIdLength + 1 + templateBudget.maxKeyLength).toBeLessThanOrEqual(uiLimits.maxKeyLength);
  });
});

describe("templateAsSpec", () => {
  it("should give a complete spec that validates with no issues when a template is wrapped", () => {
    const spec = templateAsSpec(sample, { prefix: "one" });
    expect(spec.root).toBe(templatePageKey);
    expect(spec.elements[templatePageKey]).toEqual({ type: "Box", props: { direction: "vertical", gap: "none", width: "full", surface: "page" }, children: ["one-box"] });
    expect(validateUiSpec(spec).issues).toEqual([]);
  });
});

describe("attachFragment", () => {
  const base = templateAsSpec(sample, { prefix: "one" });

  it("should hold the same template twice in one valid spec when each copy has its own prefix", () => {
    const merged = attachFragment(base, instantiateTemplate(sample, { prefix: "two" }), { parent: templatePageKey });
    expect(merged.elements[templatePageKey]?.children).toEqual(["one-box", "two-box"]);
    expect(Object.keys(merged.state ?? {})).toEqual(["one", "two"]);
    expect(Object.keys(merged.elements)).toHaveLength(1 + 2 * Object.keys(sample.fragment.elements).length);
    expect(validateUiSpec(merged).issues).toEqual([]);
  });

  it("should put the fragment at the index asked for, and at the end when the index is past it", () => {
    const first = attachFragment(base, instantiateTemplate(sample, { prefix: "two" }), { parent: templatePageKey, index: 0 });
    expect(first.elements[templatePageKey]?.children).toEqual(["two-box", "one-box"]);
    const last = attachFragment(base, instantiateTemplate(sample, { prefix: "two" }), { parent: templatePageKey, index: 99 });
    expect(last.elements[templatePageKey]?.children).toEqual(["one-box", "two-box"]);
  });

  it("should leave the spec it was given unchanged when a fragment is attached", () => {
    const before = JSON.stringify(base);
    attachFragment(base, instantiateTemplate(sample, { prefix: "two" }), { parent: templatePageKey });
    expect(JSON.stringify(base)).toBe(before);
  });

  it("should refuse a fragment whose keys the spec already has", () => {
    expect(() => attachFragment(base, instantiateTemplate(sample, { prefix: "one" }), { parent: templatePageKey })).toThrow(/already has an element with the key "one-box"/);
  });

  it("should refuse a fragment whose state key the spec already has", () => {
    const taken = { ...base, state: { ...base.state, two: {} } };
    expect(() => attachFragment(taken, instantiateTemplate(sample, { prefix: "two" }), { parent: templatePageKey })).toThrow(/state already has the key "two"/);
  });

  it("should refuse a parent the spec does not have, a leaf, and Tabs or Accordion, which pair children with entries", () => {
    const fragment = instantiateTemplate(sample, { prefix: "two" });
    expect(() => attachFragment(base, fragment, { parent: "missing" })).toThrow(/No element has the key "missing"/);
    expect(() => attachFragment(base, fragment, { parent: "one-title" })).toThrow(/is a Heading, which cannot hold a template/);
    const tabs = { ...base, elements: { ...base.elements, tabs: { type: "Tabs", props: { tabs: [{ label: "A" }] }, children: [] } } };
    expect(() => attachFragment(tabs, fragment, { parent: "tabs" })).toThrow(/is a Tabs, which cannot hold a template/);
    expect(() => attachFragment(base, fragment, { parent: "__proto__" })).toThrow(TemplateError);
  });

  it("should refuse a fragment that takes the spec past the element limit", () => {
    const filler = Object.fromEntries(Array.from({ length: uiLimits.maxElements - 5 }, (_, index) => [`filler-${String(index)}`, { type: "Text", props: { text: "x" } }]));
    const full = { ...base, elements: { ...base.elements, ...filler } };
    expect(() => attachFragment(full, instantiateTemplate(sample, { prefix: "two" }), { parent: templatePageKey })).toThrow(/the limit is 500/);
  });
});
