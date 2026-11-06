/**
 * A small line diff (Myers' O((N+M)D) algorithm) for edit reviews. Common
 * leading and trailing lines are trimmed first. When the texts differ in more
 * than `maxEdits` lines, the changed middle is shown as removed then added
 * instead, which keeps the work bounded for very large artifacts.
 */

export type DiffOp = "same" | "add" | "remove";

export interface DiffLine {
  op: DiffOp;
  text: string;
  /** 1-based line number in the old text; null for added lines. */
  oldNumber: number | null;
  /** 1-based line number in the new text; null for removed lines. */
  newNumber: number | null;
}

/** A run of changed lines with up to `context` unchanged lines around it. */
export interface DiffHunk {
  lines: DiffLine[];
}

const DEFAULT_MAX_EDITS = 2000;

/** Splits text into lines. A final newline does not add an empty line. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

interface Step {
  op: DiffOp;
  text: string;
}

function at(lines: string[], index: number): string {
  return lines[index] ?? "";
}

function read(v: Int32Array, index: number): number {
  return v[index] ?? 0;
}

/** Myers' choice: move down (insert from b) or right (delete from a) into diagonal k. */
function movesDown(v: Int32Array, k: number, d: number, offset: number): boolean {
  if (k === -d) return true;
  if (k === d) return false;
  return read(v, k - 1 + offset) < read(v, k + 1 + offset);
}

/** Backtracks Myers' saved frontiers into steps, last step first. */
function backtrack(a: string[], b: string[], trace: Int32Array[]): Step[] {
  const steps: Step[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d] ?? new Int32Array(0);
    const offset = d + 1;
    const k = x - y;
    const down = movesDown(v, k, d, offset);
    const prevK = down ? k + 1 : k - 1;
    const prevX = read(v, prevK + offset);
    const prevY = prevX - prevK;
    for (; x > prevX && y > prevY; x--, y--) steps.push({ op: "same", text: at(a, x - 1) });
    steps.push(down ? { op: "add", text: at(b, y - 1) } : { op: "remove", text: at(a, x - 1) });
    x = prevX;
    y = prevY;
  }
  for (; x > 0; x--) steps.push({ op: "same", text: at(a, x - 1) });
  return steps;
}

/** Follows a diagonal of equal lines from (x, x - k) and returns the x it reaches. */
function slide(a: string[], b: string[], x: number, k: number): number {
  let end = x;
  while (end < a.length && end - k < b.length && a[end] === b[end - k]) end++;
  return end;
}

/** The shortest edit script from `a` to `b`, or null when it needs more than `maxEdits` edits. */
function myers(a: string[], b: string[], maxEdits: number): Step[] | null {
  const max = a.length + b.length;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= Math.min(max, maxEdits); d++) {
    // Save the frontier this step starts from, for k in [-(d+1), d+1].
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      const start = movesDown(v, k, d, offset) ? read(v, k + 1 + offset) : read(v, k - 1 + offset) + 1;
      const x = slide(a, b, start, k);
      v[k + offset] = x;
      if (x >= a.length && x - k >= b.length) return backtrack(a, b, trace).reverse();
    }
  }
  return null;
}

function numbered(steps: Step[], oldStart: number, newStart: number): DiffLine[] {
  let oldNumber = oldStart;
  let newNumber = newStart;
  return steps.map((step) => {
    const line: DiffLine = {
      op: step.op,
      text: step.text,
      oldNumber: step.op === "add" ? null : oldNumber,
      newNumber: step.op === "remove" ? null : newNumber,
    };
    if (step.op !== "add") oldNumber++;
    if (step.op !== "remove") newNumber++;
    return line;
  });
}

/** Every line of both texts, marked same, added, or removed, in reading order. */
export function diffLines(before: string, after: string, maxEdits = DEFAULT_MAX_EDITS): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const middleA = a.slice(start, endA);
  const middleB = b.slice(start, endB);
  const middle = myers(middleA, middleB, maxEdits) ?? [
    ...middleA.map((text): Step => ({ op: "remove", text })),
    ...middleB.map((text): Step => ({ op: "add", text })),
  ];
  const steps: Step[] = [
    ...a.slice(0, start).map((text): Step => ({ op: "same", text })),
    ...middle,
    ...a.slice(endA).map((text): Step => ({ op: "same", text })),
  ];
  return numbered(steps, 1, 1);
}

/** How many lines were added and removed. */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.op === "add") added++;
    if (line.op === "remove") removed++;
  }
  return { added, removed };
}

/**
 * Groups changed lines into hunks with `context` unchanged lines on each
 * side. Changes closer than twice the context share one hunk. Unchanged text
 * gives no hunks.
 */
export function diffHunks(lines: DiffLine[], context = 3): DiffHunk[] {
  const changed = lines.flatMap((line, index) => (line.op === "same" ? [] : [index]));
  const hunks: DiffHunk[] = [];
  let hunkStart = -1;
  let hunkEnd = -1;
  for (const index of changed) {
    const from = Math.max(0, index - context);
    if (hunkStart >= 0 && from <= hunkEnd + 1) {
      hunkEnd = Math.min(lines.length - 1, index + context);
      continue;
    }
    if (hunkStart >= 0) hunks.push({ lines: lines.slice(hunkStart, hunkEnd + 1) });
    hunkStart = from;
    hunkEnd = Math.min(lines.length - 1, index + context);
  }
  if (hunkStart >= 0) hunks.push({ lines: lines.slice(hunkStart, hunkEnd + 1) });
  return hunks;
}

/**
 * Keeps hunks until `maxLines` lines are shown, cutting the last one short.
 * `hidden` is how many hunk lines were left out.
 */
export function capHunks(hunks: DiffHunk[], maxLines: number): { hunks: DiffHunk[]; hidden: number } {
  const shown: DiffHunk[] = [];
  let remaining = maxLines;
  let hidden = 0;
  for (const hunk of hunks) {
    const kept = hunk.lines.slice(0, Math.max(0, remaining));
    hidden += hunk.lines.length - kept.length;
    remaining -= kept.length;
    if (kept.length > 0) shown.push({ lines: kept });
  }
  return { hunks: shown, hidden };
}
