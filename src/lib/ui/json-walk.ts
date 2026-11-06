/** A value reached while walking JSON, with the object key that led to it. */
export interface JsonVisit {
  value: unknown;
  key: string | null;
  depth: number;
}

/**
 * Walks a parsed JSON value without recursion, so hostile nesting cannot
 * overflow the stack. Calls `visit` for every value. Returns false, and stops,
 * as soon as nesting goes deeper than `maxDepth`.
 */
export function walkJson(root: unknown, maxDepth: number, visit: (entry: JsonVisit) => void): boolean {
  const stack: JsonVisit[] = [{ value: root, key: null, depth: 1 }];
  for (let entry = stack.pop(); entry; entry = stack.pop()) {
    if (entry.depth > maxDepth) return false;
    visit(entry);
    pushChildren(stack, entry);
  }
  return true;
}

function pushChildren(stack: JsonVisit[], { value, depth }: JsonVisit) {
  if (Array.isArray(value)) {
    for (const item of value) stack.push({ value: item, key: null, depth: depth + 1 });
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) stack.push({ value: item, key, depth: depth + 1 });
  }
}

/** True for a non-null, non-array object. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a JSON Pointer such as "/items/0" from a value. Returns undefined when absent. */
export function readPointer(root: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return root;
  if (!pointer.startsWith("/")) return undefined;
  let current: unknown = root;
  for (const raw of pointer.slice(1).split("/")) {
    const segment = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      current = current[Number(segment)];
    } else if (isPlainObject(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}
