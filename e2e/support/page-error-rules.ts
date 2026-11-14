/** Where a page error came from: an uncaught exception, or a console message. */
export type PageErrorKind = "pageerror" | "console.error" | "console.warning";

/** One error a page reported during a test. */
export interface PageError {
  kind: PageErrorKind;
  text: string;
  /** The page or script the error came from, when Playwright knows it. */
  url: string;
}

/** An error a test or the whole suite lets pass, with the reason. */
export interface PageErrorAllowance {
  /** A RegExp, or a string, matched against the error's text and, separately, its URL. */
  pattern: RegExp | string;
  reason: string;
}

/** Longest error text quoted in a failure; a hydration diff can run to pages. */
const quotedTextLimit = 1_000;

const hydrationWords = /hydrat/i;

/**
 * Which console messages fail a test: every `console.error`, and warnings
 * that report a hydration mismatch, which some React and Next versions log
 * as warnings rather than errors.
 */
export function consoleMessageKind(type: string, text: string): PageErrorKind | null {
  if (type === "error") return "console.error";
  if (type === "warning" && hydrationWords.test(text)) return "console.warning";
  return null;
}

function matches(pattern: RegExp | string, value: string): boolean {
  if (typeof pattern === "string") return value.includes(pattern);
  // `search` ignores `lastIndex`, so a pattern with the g flag matches every time.
  return value.search(pattern) !== -1;
}

/**
 * Whether an allowance covers an error: its pattern matches the error's text
 * or its URL. A failed request's console text names no URL ("Failed to load
 * resource: …"), so the URL is how a test names the request it broke.
 */
export function allowanceCovers(allowance: PageErrorAllowance, error: PageError): boolean {
  return matches(allowance.pattern, error.text) || (error.url !== "" && matches(allowance.pattern, error.url));
}

/** The errors no allowance covers, in the order they arrived. */
export function unexpectedPageErrors(errors: readonly PageError[], allowances: readonly PageErrorAllowance[]): PageError[] {
  return errors.filter((error) => !allowances.some((allowance) => allowanceCovers(allowance, error)));
}

function quoted(text: string): string {
  if (text.length <= quotedTextLimit) return text;
  return `${text.slice(0, quotedTextLimit)}… (${String(text.length - quotedTextLimit)} more characters)`;
}

/** How many errors a failure lists before it says how many more there were. */
export const listedErrorLimit = 10;

/** An allowance as a reader sees it: the pattern as written, then the reason. */
function allowanceLine(allowance: PageErrorAllowance): string {
  const pattern = typeof allowance.pattern === "string" ? JSON.stringify(allowance.pattern) : String(allowance.pattern);
  return `- ${pattern}: ${allowance.reason}`;
}

/**
 * The failure message: the first `listedErrorLimit` unexpected errors, each
 * with its kind and where it came from, how many more there were, and the
 * allowances already in force in the test, so a reader sees what was let
 * pass and why the rest was not.
 */
export function pageErrorReport(errors: readonly PageError[], allowances: readonly PageErrorAllowance[] = []): string {
  const lines = errors.slice(0, listedErrorLimit).map((error, index) => {
    const where = error.url ? ` (${error.url})` : "";
    return `${String(index + 1)}. ${error.kind}${where}: ${quoted(error.text)}`;
  });
  const unlisted = errors.length - lines.length;
  if (unlisted > 0) lines.push(`… and ${String(unlisted)} more.`);
  const allowed = allowances.length > 0
    ? ["", "Already allowed in this test:", ...allowances.map(allowanceLine)]
    : ["", "Nothing is allowed in this test."];
  return [
    `The page reported ${String(errors.length)} unexpected error${errors.length === 1 ? "" : "s"}:`,
    ...lines,
    ...allowed,
    "",
    "Fix the cause. If the test causes it on purpose, call allowPageError(pattern, reason) from e2e/support/test.ts in that test.",
  ].join("\n");
}
