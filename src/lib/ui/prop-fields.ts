import { z } from "zod";

import { componentChecks, componentProps, type UiComponentName } from "./catalog";
import { pairedChildren } from "./props/layout";

/**
 * A plain description of a component's props, read from its zod schema, so
 * the interface editor can draw a properties form for every catalog
 * component without a hand-written form per component. Anything the form
 * cannot edit (such as a Table's rows, which have their own grid) is
 * "unsupported" and left to View source.
 */

/** How one value is edited. */
export type FieldModel =
  | { kind: "text"; max: number | undefined; multiline: boolean }
  | { kind: "number"; int: boolean; min: number | undefined; max: number | undefined }
  | { kind: "boolean" }
  | { kind: "choice"; options: readonly string[] }
  /** A table cell, metric value, or key-value value: a number when it reads as one, otherwise text. */
  | { kind: "textOrNumber"; nullable: boolean }
  /** A list of short values, one per line, such as chart labels or a series' numbers. */
  | { kind: "lines"; item: "text" | "number" | "numberOrEmpty" }
  /** A list of objects, such as a table's columns or a board's cards. `fixed`: rows cannot be added or removed here. */
  | { kind: "rows"; fields: readonly PropField[]; fixed: boolean }
  | { kind: "unsupported" };

/** One named prop and how to edit it. */
export interface PropField {
  name: string;
  label: string;
  optional: boolean;
  model: FieldModel;
}

/** Text longer than this edits in a multi-line field. */
const multilineFrom = 300;

/** "changeFormat" → "Change format". */
export function fieldLabel(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function unwrap(schema: z.ZodType): { inner: z.ZodType; optional: boolean } {
  let inner = schema;
  let optional = false;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
    optional = true;
    inner = inner.unwrap() as z.ZodType;
  }
  return { inner, optional };
}

/** The editable kind of a union: text or number, or a list item that may be empty. */
function unionModel(union: z.ZodUnion): FieldModel {
  const options = union.options as readonly z.ZodType[];
  const hasNumber = options.some((option) => option instanceof z.ZodNumber);
  const hasString = options.some((option) => option instanceof z.ZodString);
  const nullable = options.some((option) => option instanceof z.ZodNull);
  if (hasNumber || hasString) return { kind: "textOrNumber", nullable };
  return { kind: "unsupported" };
}

function linesModel(element: z.ZodType): FieldModel {
  const { inner } = unwrap(element);
  if (inner instanceof z.ZodString) return { kind: "lines", item: "text" };
  if (inner instanceof z.ZodNumber) return { kind: "lines", item: "number" };
  if (inner instanceof z.ZodUnion) {
    const options = inner.options as readonly z.ZodType[];
    if (options.every((option) => option instanceof z.ZodNumber || option instanceof z.ZodNull)) return { kind: "lines", item: "numberOrEmpty" };
  }
  return { kind: "unsupported" };
}

function arrayModel(array: z.ZodArray, fixed: boolean): FieldModel {
  const element = array.element as z.ZodType;
  if (element instanceof z.ZodObject) return { kind: "rows", fields: describeShape(element), fixed };
  return linesModel(element);
}

function textModel(inner: z.ZodString): FieldModel {
  const max = inner.maxLength ?? undefined;
  return { kind: "text", max, multiline: max !== undefined && max > multilineFrom };
}

function numberModel(inner: z.ZodNumber): FieldModel {
  return { kind: "number", int: inner.format?.includes("int") ?? false, min: inner.minValue ?? undefined, max: inner.maxValue ?? undefined };
}

function scalarModel(inner: z.ZodType): FieldModel {
  if (inner instanceof z.ZodString) return textModel(inner);
  // Formats such as an uploaded file's id (a uuid) are text too.
  if (inner instanceof z.ZodStringFormat) return { kind: "text", max: undefined, multiline: false };
  if (inner instanceof z.ZodNumber) return numberModel(inner);
  if (inner instanceof z.ZodBoolean) return { kind: "boolean" };
  if (inner instanceof z.ZodEnum) return { kind: "choice", options: inner.options.map(String) };
  if (inner instanceof z.ZodUnion) return unionModel(inner);
  return { kind: "unsupported" };
}

function fieldModel(schema: z.ZodType, fixed: boolean): { model: FieldModel; optional: boolean } {
  const { inner, optional } = unwrap(schema);
  if (inner instanceof z.ZodArray) return { model: arrayModel(inner, fixed), optional };
  return { model: scalarModel(inner), optional };
}

function describeShape(object: z.ZodObject, fixedName?: string): PropField[] {
  return Object.entries(object.shape as Record<string, z.ZodType>).map(([name, schema]) => {
    const { model, optional } = fieldModel(schema, name === fixedName);
    return { name, label: fieldLabel(name), optional, model };
  });
}

/**
 * Every prop of a component and how to edit it. The labels of Tabs and
 * Accordion are fixed-length rows: each pairs with a child block, so they
 * are added and removed as blocks, not here.
 */
export function describeProps(type: UiComponentName): PropField[] {
  const fixed = type === "Tabs" || type === "Accordion" ? pairedChildren[type] : undefined;
  return describeShape(componentProps[type], fixed);
}

/** Why `props` cannot be saved for `type` (schema, then cross-field rules), or null when they can. */
export function propsProblem(type: UiComponentName, props: Record<string, unknown>): string | null {
  const parsed = componentProps[type].safeParse(props);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (!issue) return "Check the values.";
    const where = issue.path.map((part) => (typeof part === "number" ? `#${String(part + 1)}` : fieldLabel(String(part)))).join(" › ");
    return where ? `${where}: ${issue.message}` : issue.message;
  }
  return componentChecks[type]?.(props)[0] ?? null;
}

/** Reads a typed cell: a number when the text is one, empty as null when allowed, otherwise the text. */
export function readTextOrNumber(text: string, nullable: boolean): string | number | null {
  const trimmed = text.trim();
  if (trimmed === "" && nullable) return null;
  if (trimmed !== "" && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(trimmed)) return Number(trimmed);
  return text;
}

/** Reads one item per line. Number lists skip blank lines, except where an empty line is a gap (null). */
export function readLines(text: string, item: "text" | "number" | "numberOrEmpty"): (string | number | null)[] {
  const lines = text.split("\n");
  if (item === "text") return lines.filter((line) => line.trim() !== "");
  const values: (number | null)[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (item === "numberOrEmpty") values.push(null);
      continue;
    }
    values.push(Number(trimmed));
  }
  // A trailing newline while typing is not a gap.
  while (item === "numberOrEmpty" && values.length > 0 && values.at(-1) === null && text.endsWith("\n")) values.pop();
  return values;
}

/** A text, number, or yes/no value as it shows in a field; anything else (empty, null, objects) as empty. */
export function scalarText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** One item per line, for the lines field. */
export function writeLines(values: unknown): string {
  if (!Array.isArray(values)) return "";
  return values.map(scalarText).join("\n");
}
