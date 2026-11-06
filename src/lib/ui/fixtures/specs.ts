/**
 * Whole-spec fixtures for the gallery and tests: specs that are partly broken
 * on purpose, and generators for hostile specs that must be rejected.
 */

/** A valid layout that contains one unknown component. It renders; the unknown element shows nothing. */
export const unknownTypeSpec = {
  version: 1,
  root: "page",
  elements: {
    page: { type: "Stack", props: {}, children: ["before", "mystery", "after"] },
    before: { type: "Text", props: { text: "The element below has an unknown type and renders nothing." } },
    mystery: { type: "Hologram", props: { intensity: 11 } },
    after: { type: "Text", props: { text: "This text still renders after it." } },
  },
};

/** A spec whose middle element has invalid props. The rest still renders. */
export const invalidPropsSpec = {
  version: 1,
  root: "page",
  elements: {
    page: { type: "Stack", props: {}, children: ["ok", "broken-chart", "broken-metric", "ok-2"] },
    ok: { type: "Text", props: { text: "Elements around the broken ones render normally." } },
    "broken-chart": { type: "Chart", props: { type: "pie", labels: ["a"], series: [{ name: "x", values: ["one"] }] } },
    "broken-metric": { type: "Metric", props: { label: "Missing value" } },
    "ok-2": { type: "Badge", props: { label: "still here", tone: "success" } },
  },
};

/** A spec with a javascript: link, which validation must reject. */
export const javascriptLinkSpec = {
  version: 1,
  root: "link",
  elements: { link: { type: "Link", props: { label: "Click", href: "javascript:alert(document.cookie)" } } },
};

/** A Stack with `count` Text children: more than the element limit when count > 499. */
export function manyElementsSpec(count: number) {
  const keys = Array.from({ length: count }, (_, index) => `t${index}`);
  const elements: Record<string, unknown> = { root: { type: "Stack", props: {}, children: keys } };
  for (const key of keys) elements[key] = { type: "Text", props: { text: key } };
  return { version: 1, root: "root", elements };
}

/** A chain of Stacks `depth` levels deep. */
export function deepSpec(depth: number) {
  const elements: Record<string, unknown> = {};
  for (let level = 0; level < depth; level += 1) {
    const last = level === depth - 1;
    elements[`s${level}`] = last ? { type: "Text", props: { text: "bottom" } } : { type: "Stack", props: {}, children: [`s${level + 1}`] };
  }
  return { version: 1, root: "s0", elements };
}

/** JSON text nested `depth` arrays deep inside a prop. */
export function deepJsonText(depth: number): string {
  return `{"version":1,"root":"t","elements":{"t":{"type":"Text","props":{"text":"x","extra":${"[".repeat(depth)}${"]".repeat(depth)}}}}}`;
}

/** A Stack that repeats over `count` state items. */
export function repeatSpec(count: number) {
  return {
    version: 1,
    root: "list",
    state: { items: Array.from({ length: count }, (_, index) => ({ id: String(index), name: `Item ${index}` })) },
    elements: {
      list: { type: "Stack", props: {}, repeat: { statePath: "/items", key: "id" }, children: ["item"] },
      item: { type: "Text", props: { text: { $item: "name" } } },
    },
  };
}
