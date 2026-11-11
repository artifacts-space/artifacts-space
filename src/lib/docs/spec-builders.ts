import { UI_SPEC_VERSION } from "@/lib/ui/version";

/**
 * Small helpers for writing the example specs in the docs. Every example is a
 * complete ui spec that an agent can copy and save as it is; tests check that
 * each one passes validation with no issues.
 */

/** One element of an example spec, as an agent writes it. */
export interface DocElement {
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
  visible?: unknown;
  repeat?: unknown;
  on?: unknown;
}

/** A complete example spec. */
export interface DocSpec {
  version: number;
  root: string;
  elements: Record<string, DocElement>;
  state?: Record<string, unknown>;
}

/** One live example: a title, an optional note, and the spec. */
export interface DocExample {
  title: string;
  note?: string;
  spec: DocSpec;
}

/** A spec from a root key, its elements, and optional initial state. */
export function spec(root: string, elements: Record<string, DocElement>, state?: Record<string, unknown>): DocSpec {
  return state ? { version: UI_SPEC_VERSION, root, elements, state } : { version: UI_SPEC_VERSION, root, elements };
}

function kebab(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * A spec with one component as the root and, for containers, named children
 * in order. The root key is the component name in kebab case, such as "key-value".
 */
export function single(type: string, props: Record<string, unknown>, children: Record<string, DocElement> = {}): DocSpec {
  const keys = Object.keys(children);
  const root: DocElement = keys.length > 0 ? { type, props, children: keys } : { type, props };
  return spec(kebab(type), { [kebab(type)]: root, ...children });
}

/** A Text element, for container examples. */
export function text(value: string, extra: Record<string, unknown> = {}): DocElement {
  return { type: "Text", props: { text: value, ...extra } };
}

const maxInlineWidth = 72;

/** One-line JSON with a space after each comma and colon. */
function inline(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  const entries = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`);
  return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
}

/**
 * Pretty JSON that stays short: an object or array whose one-line form fits
 * in about 72 characters stays on one line, so label and value lists read at
 * a glance. The output is plain JSON and parses back to the same value.
 */
export function compactJson(value: unknown, indent = ""): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const oneLine = inline(value);
  if (indent.length + oneLine.length <= maxInlineWidth) return oneLine;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    return `[\n${value.map((item) => `${inner}${compactJson(item, inner)}`).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value).map(([key, item]) => `${inner}${JSON.stringify(key)}: ${compactJson(item, inner)}`);
  return `{\n${entries.join(",\n")}\n${indent}}`;
}

/** Example JSON as people copy it: compact pretty-printing. */
export function specJson(value: DocSpec): string {
  return compactJson(value);
}

/** Files the media examples point at. The docs show a stand-in image; nothing is uploaded. */
export const docsExampleFiles = [
  { id: "7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a", filename: "architecture.png", contentType: "image/png", size: 48_213, createdAt: "2026-11-05T00:00:00.000Z", replacedAt: null },
  { id: "1f6b2a40-93c4-4c8e-b1d2-5e7a9c0f3b21", filename: "q3-board-report.pdf", contentType: "application/pdf", size: 2_481_934, createdAt: "2026-11-05T00:00:00.000Z", replacedAt: null },
] as const;
