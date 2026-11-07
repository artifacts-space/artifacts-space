import { z } from "zod";

/**
 * Turns a zod object schema into rows for a props or arguments table, by way
 * of JSON Schema. The docs build their tables from the same schemas the
 * server validates with, so a table can never drift from the code.
 */

/** One row of a props or arguments table. */
export interface PropRow {
  /** Dotted path, such as `columns[].key`. */
  name: string;
  /** Short type text, such as `string`, `number (int)`, or `"bar" | "line"`. */
  type: string;
  required: boolean;
  /** Limits and defaults in words, such as `max 160 chars` or `1–4`. */
  constraints: string[];
  /** The schema's own description, when it has one. */
  description: string;
  /** Nesting depth: 0 for top-level props. */
  depth: number;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asList(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

const maxNestedDepth = 3;

function literalText(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

const numberText = (value: number) => value.toLocaleString("en-US");

function rangeText(min: unknown, max: unknown, unit = ""): string | null {
  const low = typeof min === "number" ? min : null;
  const high = typeof max === "number" ? max : null;
  if (low !== null && high !== null) return low === high ? `exactly ${numberText(low)}${unit}` : `${numberText(low)}–${numberText(high)}${unit}`;
  if (high !== null) return `max ${numberText(high)}${unit}`;
  if (low !== null && low > 0) return `min ${numberText(low)}${unit}`;
  return null;
}

/** The variants of a union schema, or null when it is not one. */
function variants(schema: Json): Json[] | null {
  const options = asList(schema.anyOf ?? schema.oneOf);
  return options.length > 0 ? options : null;
}

/** Type text for literal values: enums, consts, and unions. Null when the schema is none of them. */
function literalType(schema: Json): string | null {
  if (Array.isArray(schema.enum)) return schema.enum.map(literalText).join(" | ");
  if (schema.const !== undefined) return literalText(schema.const);
  const union = variants(schema);
  return union ? [...new Set(union.map(typeText))].join(" | ") : null;
}

function baseType(schema: Json): string {
  const literal = literalType(schema);
  if (literal) return literal;
  if (schema.type === "array") return `${isObject(schema.items) ? wrapUnion(typeText(schema.items)) : "unknown"}[]`;
  if (schema.type === "object") return isObject(schema.additionalProperties) ? `{ [key]: ${typeText(schema.additionalProperties)} }` : "object";
  if (typeof schema.type === "string") return schema.type;
  if (Array.isArray(schema.type)) return schema.type.map(String).join(" | ");
  return "any";
}

function wrapUnion(text: string): string {
  return text.includes(" | ") ? `(${text})` : text;
}

/** Short type text for one schema. */
export function typeText(schema: Json): string {
  const text = baseType(schema);
  return schema.format === "uuid" ? "string (uuid)" : text;
}

function constraintsOf(schema: Json): string[] {
  const found: string[] = [];
  const chars = rangeText(schema.minLength, schema.maxLength, " chars");
  if (chars) found.push(chars);
  const items = rangeText(schema.minItems, schema.maxItems, " items");
  if (items) found.push(items);
  const range = rangeText(schema.minimum, schema.maximum);
  if (range) found.push(range);
  if (typeof schema.exclusiveMinimum === "number") found.push(`> ${String(schema.exclusiveMinimum)}`);
  if (typeof schema.pattern === "string" && schema.pattern === "^[A-Za-z]{3}$") found.push("3-letter code");
  if (schema.default !== undefined) found.push(`default ${JSON.stringify(schema.default)}`);
  const union = variants(schema);
  if (union) for (const option of union) found.push(...constraintsOf(option).filter((item) => !found.includes(item)));
  return found;
}

/** The object schema whose properties should be listed under this one, if any. */
function nestedObject(schema: Json): Json | null {
  if (schema.type === "object" && isObject(schema.properties)) return schema;
  if (schema.type === "array" && isObject(schema.items)) return nestedObject(schema.items);
  return null;
}

function rowsOf(schema: Json, prefix: string, depth: number): PropRow[] {
  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []);
  return Object.entries(properties).flatMap(([key, value]) => {
    if (!isObject(value)) return [];
    const name = `${prefix}${key}`;
    const row: PropRow = {
      name,
      type: typeText(value),
      required: required.has(key),
      constraints: constraintsOf(value),
      description: typeof value.description === "string" ? value.description : "",
      depth,
    };
    const nested = depth < maxNestedDepth ? nestedObject(value) : null;
    const suffix = value.type === "array" ? "[]." : ".";
    return nested ? [row, ...rowsOf(nested, `${name}${suffix}`, depth + 1)] : [row];
  });
}

/**
 * Rows for every property of an object schema, nested properties after
 * their parent with a dotted path. Refinements that JSON Schema cannot
 * express (such as "a real calendar date") are not listed; document them
 * next to the table.
 */
export function propRows(schema: z.ZodType): PropRow[] {
  const json = z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }) as Json;
  return rowsOf(json, "", 0);
}

/** Rows for an MCP tool's input, given as a zod raw shape (an object of field schemas). */
export function shapeRows(shape: Record<string, z.ZodType>): PropRow[] {
  return propRows(z.object(shape));
}
