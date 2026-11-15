import { specError, specWarning, type UiSpecIssue } from "./issues";

/**
 * Reading a JSON artifact from what an author sent, shared by the formats
 * whose content is one JSON object (ui specs and canvases): the size limit,
 * the parse, and the version field, each with a message that says how to fix
 * it. The formats differ only in their limits and in the words they use.
 */

/** How one format names itself in the messages. */
export interface JsonInputOptions {
  /** Largest input, in UTF-8 bytes of its JSON text. */
  maxBytes: number;
  /** What the content is, in running text: "spec" or "canvas". */
  noun: string;
  /** What to split an oversized one into: "artifacts" or "canvases". */
  splitInto: string;
  /** One sentence showing the expected shape, added after the parser's reason when the text is not JSON. */
  shapeHint: string;
}

/** The parsed value, or the one issue that stopped it from being read. */
export type JsonInput = { value: unknown } | { issue: UiSpecIssue };

const encoder = new TextEncoder();

/** A value as JSON text, or null when it cannot be written out (a cycle, or nesting too deep for the serializer). */
export function stringifyJson(value: unknown): string | null {
  try {
    const text = JSON.stringify(value) as string | undefined;
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}

/**
 * Reads JSON text, or an already-parsed value, within a byte limit. The size
 * is checked before the text is parsed, so an oversized input costs nothing
 * more than counting its bytes.
 */
export function readJsonInput(input: unknown, { maxBytes, noun, splitInto, shapeHint }: JsonInputOptions): JsonInput {
  const text = typeof input === "string" ? input : stringifyJson(input);
  if (text === null) return { issue: specError("invalid_json", `The ${noun} could not be read as JSON.`) };
  const bytes = encoder.encode(text).length;
  if (bytes > maxBytes) {
    return { issue: specError("too_large", `The ${noun} is ${bytes.toLocaleString("en-US")} bytes; the limit is ${maxBytes.toLocaleString("en-US")}. Split it into several ${splitInto} or trim data.`) };
  }
  if (typeof input !== "string") return { value: input };
  try {
    return { value: JSON.parse(input) as unknown };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "it is not valid JSON";
    return { issue: specError("invalid_json", `The content is not valid JSON: ${reason}. ${shapeHint}`) };
  }
}

/**
 * Reads the top-level `version` of a JSON artifact whose current version is
 * `current`. A missing version is a warning and reads as current; `whyKeep`
 * finishes the sentence that asks for it ("so the spec keeps its meaning as
 * components evolve"). Anything but an integer from 1 to `current` is an error.
 */
export function readVersionField(raw: Record<string, unknown>, current: number, whyKeep: string): { version: number; issue?: UiSpecIssue } {
  const version = raw.version;
  if (version === undefined) {
    return { version: current, issue: specWarning("missing_version", `Add "version": ${String(current)} at the top level ${whyKeep}.`) };
  }
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > current) {
    return { version: current, issue: specError("unsupported_version", `"version" must be an integer from 1 to ${String(current)}. Use ${String(current)}.`) };
  }
  return { version };
}
