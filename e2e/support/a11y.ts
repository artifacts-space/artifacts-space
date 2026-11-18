import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./test";

/*
 * Accessibility checks for the e2e specs: axe-core's rules run against a page
 * or one part of it, in the state the spec put it in (a menu open, an item
 * highlighted). Use it after the state is on screen, and pair it with
 * `toMatchAriaSnapshot` where the accessibility tree itself is the point.
 */

/**
 * Why a rule is left out of one scan: a reason alone leaves it out of the
 * whole scan; `{ on, reason }` leaves it out only on the nodes the CSS
 * selector `on` matches, and still runs it everywhere else.
 */
export type SkippedRule = string | { readonly on: string; readonly reason: string };

/** Rules left out of one scan, by rule id, each with its reason. */
export type SkippedRules = Readonly<Record<string, SkippedRule>>;

interface ScanOptions {
  /**
   * Rules this scan leaves out, each with why: `{ "color-contrast": "…" }`,
   * or only on some nodes: `{ "landmark-unique": { on: "pre[role=region]", reason: "…" } }`.
   * Prefer the narrower form; name the reason; never skip silently.
   */
  skip?: SkippedRules;
  /**
   * Run only these rules, for a scan about one thing (color contrast across a
   * whole page). Skips still apply, and a rule skipped on some nodes runs
   * only when it is one of these. Nodes axe could not judge (text over an
   * image, or partly covered) do not fail the scan: they are listed on the
   * test as an "axe could not judge" annotation, so the gap shows in the report.
   */
  only?: readonly string[];
}

/**
 * Rules about a whole page's structure (landmarks, one main, one h1). They
 * say nothing about one component, so a scan of a part leaves them out.
 */
const pageStructureRules = ["region", "landmark-one-main", "page-has-heading-one"];

/**
 * Names one element for axe's `include` without changing it: a CSS selector,
 * or, for an element inside a shadow root, the host's selector followed by
 * the selectors inside it (axe's `fromShadowDom`).
 */
type ScanSelector = string | { readonly fromShadowDom: [string, string, ...string[]] };

/** The part of a page a scan is limited to, or null for the whole page. */
type ScanScope = readonly ScanSelector[] | null;

/** One rule's result from an axe run, of either kind: a violation, or nodes the rule could not judge (`incomplete`). */
interface AxeRuleResult {
  id: string;
  help: string;
  helpUrl: string;
  nodes: { target: unknown[]; failureSummary?: string | undefined }[];
}

/** One line per violation, then one indented line per failing node: its selector and what is wrong. */
function report(violations: readonly AxeRuleResult[]): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes.map((node) => {
        const summary = (node.failureSummary ?? "").replace(/\s+/g, " ").trim();
        return `    ${node.target.map(String).join(" >> ")}${summary ? `\n      ${summary}` : ""}`;
      });
      return [`  ${violation.id}: ${violation.help} (${violation.helpUrl})`, ...nodes].join("\n");
    })
    .join("\n");
}

/**
 * Waits for finite animations (a menu fading in) to end, so color contrast is
 * read at the colors people end up seeing. Endless ones (spinners) are left alone.
 */
async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    // A paused animation never finishes; leave it out, and never wait past two seconds.
    const finite = document.getAnimations().filter((animation) => animation.playState === "running" && animation.effect?.getComputedTiming().endTime !== Infinity);
    const settled = Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
    await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 2000))]);
  });
}

/** A builder for one scan: the whole page, or only the elements named. */
function builder(page: Page, scope: ScanScope): AxeBuilder {
  const axe = new AxeBuilder({ page });
  for (const selector of scope ?? []) axe.include(selector);
  return axe;
}

/**
 * Drops the nodes that `selector` matches themselves, and any entry left
 * with none, from axe results of either kind (violations, or nodes a rule
 * could not judge). A node inside a match is kept. Filtered after the run,
 * because axe's own `exclude` cannot take out a node the scan was told to
 * include.
 */
async function withoutNodesOn(page: Page, entries: readonly AxeRuleResult[], selector: string): Promise<AxeRuleResult[]> {
  const kept: AxeRuleResult[] = [];
  for (const entry of entries) {
    const targets = entry.nodes.map((node) => {
      const last = node.target.at(-1);
      return typeof last === "string" ? last : "";
    });
    const skipped = await page.evaluate(({ list, on }) => list.map((target) => target !== "" && document.querySelector(target)?.matches(on) === true), { list: targets, on: selector });
    const nodes = entry.nodes.filter((_, index) => skipped[index] !== true);
    if (nodes.length > 0) kept.push({ ...entry, nodes });
  }
  return kept;
}

/** The annotation a scan run with `only` leaves on its test for nodes a rule could not judge. */
export const unjudgedNote = "axe could not judge";

/**
 * Records, on the running test, the nodes a rule could not judge either way
 * (axe's `incomplete`): the rule, how many, and the first few selectors. A
 * scan passes without them, so the report says what it did not prove. The
 * same finding is listed once, however often the scan runs again (a retried
 * scan reads the same nodes each time).
 */
function noteUnjudged(page: Page, incomplete: readonly AxeRuleResult[]): void {
  const { annotations } = test.info();
  for (const entry of incomplete) {
    if (entry.nodes.length === 0) continue;
    const first = entry.nodes.slice(0, 5).map((node) => node.target.map(String).join(" >> "));
    const note = { type: unjudgedNote, description: `${entry.id} on ${String(entry.nodes.length)} node(s) at ${page.url()}: ${first.join("; ")}` };
    if (!annotations.some((existing) => existing.type === note.type && existing.description === note.description)) annotations.push(note);
  }
}

/**
 * The first pass: every rule but `left`, or the rules in `only` that are not
 * in `left`. When `only` names nothing else (its one rule is skipped on some
 * nodes), there is nothing to run here and the narrowed pass does the work;
 * `ran` says how many rules this pass ran, so a scan that runs none can fail.
 */
async function mainPass(page: Page, scope: ScanScope, left: readonly string[], only: readonly string[] | undefined): Promise<{ violations: AxeRuleResult[]; incomplete: AxeRuleResult[]; ran: number | null }> {
  if (!only) return { ...(await builder(page, scope).disableRules([...left]).analyze()), ran: null };
  const wanted = only.filter((rule) => !left.includes(rule));
  if (wanted.length === 0) return { violations: [], incomplete: [], ran: 0 };
  return { ...(await builder(page, scope).withRules(wanted).analyze()), ran: wanted.length };
}

/** A rule skipped only on some nodes: its id, and where and why it is left out. */
type NarrowedSkip = readonly [rule: string, why: { readonly on: string; readonly reason: string }];

/** The skips that name nodes and that this scan runs: all of them, or with `only`, the ones `only` names. */
function narrowedSkips(skip: SkippedRules, only: readonly string[] | undefined): NarrowedSkip[] {
  const narrowed: NarrowedSkip[] = [];
  for (const [rule, why] of Object.entries(skip)) {
    if (typeof why !== "string" && (!only || only.includes(rule))) narrowed.push([rule, why]);
  }
  return narrowed;
}

/**
 * The second pass: each rule skipped only on some nodes, run everywhere and
 * kept everywhere but there. With `only`, what the rule could not judge
 * outside those nodes is recorded here, since the first pass left the rule out.
 */
async function narrowedPass(page: Page, scope: ScanScope, skips: readonly NarrowedSkip[], recordUnjudged: boolean): Promise<AxeRuleResult[]> {
  const violations: AxeRuleResult[] = [];
  // One after another: axe cannot run twice at once in a page.
  for (const [rule, why] of skips) {
    const narrowed = await builder(page, scope).withRules([rule]).analyze();
    violations.push(...(await withoutNodesOn(page, narrowed.violations, why.on)));
    if (recordUnjudged) noteUnjudged(page, await withoutNodesOn(page, narrowed.incomplete, why.on));
  }
  return violations;
}

/**
 * Runs every rule but the skipped ones (and, on a part, the page-structure
 * ones), or only the rules in `only`, then each rule skipped only on some
 * nodes, everywhere but there. A scan left with no rule to run throws: it
 * would pass having checked nothing.
 */
async function runRules(page: Page, scope: ScanScope, skip: SkippedRules, only: readonly string[] | undefined): Promise<AxeRuleResult[]> {
  const partOnly = scope ? pageStructureRules : [];
  const main = await mainPass(page, scope, [...partOnly, ...Object.keys(skip)], only);
  const skips = narrowedSkips(skip, only);
  if (only && main.ran === 0 && skips.length === 0) {
    const part = scope ? ` or is a page-structure rule (${pageStructureRules.join(", ")}) that a scan of a part never runs` : "";
    throw new Error(`This scan runs no rule: only [${only.join(", ")}] is left out by its skips${part}.`);
  }
  if (only) noteUnjudged(page, main.incomplete);
  return [...main.violations, ...(await narrowedPass(page, scope, skips, only !== undefined))];
}

/**
 * What the page says about one element it was asked to name: its selectors,
 * or why it cannot be named.
 */
type NamedElement = { readonly path: string[] } | { readonly problem: string };

/**
 * Names every element a locator matches with a selector, without changing
 * the page. A scan that marked the elements instead (an attribute) would
 * change them before React has taken over a server-rendered page, and React
 * would log a hydration mismatch for the attribute the server did not send.
 * Each selector is a child-position path from the top of the element's tree
 * (`*:nth-child(1):not(* *) > *:nth-child(2)`), checked in the page to match that
 * element and no other. An element in a shadow root is named by the path to
 * its host, then the path inside.
 */
async function selectorsFor(scope: Locator): Promise<ScanSelector[]> {
  const named = await scope.evaluateAll((elements): NamedElement[] => {
    const pathInTree = (element: Element): string => {
      const segments: string[] = [];
      let node: Element | null = element;
      while (node) {
        const siblings = node.parentNode?.children;
        const position = siblings ? Array.prototype.indexOf.call(siblings, node) + 1 : 1;
        // The top of a tree has no element above it; `:not(* *)` keeps its segment from matching deeper down.
        const top = node.parentElement ? "" : ":not(* *)";
        segments.unshift(`*:nth-child(${String(position)})${top}`);
        node = node.parentElement;
      }
      return segments.join(" > ");
    };
    const nameElement = (element: Element): NamedElement => {
      if (window.top !== window) return { problem: "it is inside a frame, which a scan of this page cannot reach" };
      const path: string[] = [];
      let current: Element = element;
      for (;;) {
        const root = current.getRootNode();
        if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return { problem: "it is not in a document" };
        const selector = pathInTree(current);
        const matches = root.querySelectorAll(selector);
        if (matches.length !== 1 || matches[0] !== current) return { problem: `the selector ${selector} does not match it alone` };
        path.unshift(selector);
        if (!(root instanceof ShadowRoot)) return { path };
        current = root.host;
      }
    };
    return elements.map(nameElement);
  });
  return named.map((entry) => {
    if ("problem" in entry) throw new Error(`Cannot scan ${scope.toString()}: ${entry.problem}.`);
    const [first, second, ...rest] = entry.path;
    return first !== undefined && second !== undefined ? { fromShadowDom: [first, second, ...rest] } : (first ?? "");
  });
}

/** How many times a scan of a part is taken before it gives up on a page that keeps moving its elements. */
const scopeTries = 3;

/**
 * axe's words when a selector it was given matches nothing. If axe ever
 * words it differently, such a scan fails with axe's own error instead of
 * being taken again: loud, never a wrong pass.
 */
const scopeMatchedNothing = "No elements found for include";

/** The annotation a test gets when a scan of a part had to be taken again, so a page that moves under its scans can be found. */
export const retakenNote = "axe-scan-retaken";

/**
 * One scan of what `target` matches, or null when the page moved those
 * elements while it ran. The selectors name elements by their place in the
 * tree (selectorsFor), so an element added or removed above them between
 * the naming and the scan (a portal, a toast, a box going to the top layer)
 * leaves a selector matching nothing, or matching another element. Both are
 * caught: axe says when a selector matches nothing, and the elements are
 * named again after the scan and must have the names they had before it.
 * A scan that did not count leaves no note of what it could not judge: its
 * notes may name the wrong elements.
 */
async function scanInPlace(page: Page, target: Locator, skip: SkippedRules, only: readonly string[] | undefined): Promise<AxeRuleResult[] | null> {
  const { annotations } = test.info();
  const notesBefore = annotations.length;
  const selectors = await selectorsFor(target);
  if (selectors.length === 0) throw new Error(`Cannot scan ${target.toString()}: it matches no element.`);
  let found: AxeRuleResult[];
  try {
    found = await runRules(page, selectors, skip, only);
  } catch (error) {
    if (error instanceof Error && error.message.includes(scopeMatchedNothing)) return null;
    throw error;
  }
  const after = await selectorsFor(target);
  if (JSON.stringify(after) === JSON.stringify(selectors)) return found;
  annotations.length = notesBefore;
  return null;
}

async function analyze(page: Page, target: Locator | null, skip: SkippedRules, only: readonly string[] | undefined): Promise<AxeRuleResult[]> {
  if (!target) return runRules(page, null, skip, only);
  for (let attempt = 1; attempt <= scopeTries; attempt += 1) {
    const found = await scanInPlace(page, target, skip, only);
    if (found === null) continue;
    if (attempt > 1) test.info().annotations.push({ type: retakenNote, description: `${target.toString()} at ${page.url()}: scan ${String(attempt)} counted, the page moved its elements during the ones before` });
    return found;
  }
  throw new Error(`Cannot scan ${target.toString()}: the page moved its elements during each of ${String(scopeTries)} scans.`);
}

/**
 * Runs axe on the page, or only on what `target` matches when it is a
 * locator, and fails with every violation listed: the rule id, its help text
 * and link, and each failing node's selector with what is wrong. Rules in
 * `options.skip` are left out of this scan only, each with its reason, on
 * the whole scan or only on the nodes a selector names.
 */
export async function expectNoAxeViolations(target: Page | Locator, options: ScanOptions = {}): Promise<void> {
  const isPage = "goto" in target;
  const page = isPage ? target : target.page();
  const scope = isPage ? null : target;
  if (scope) await expect(scope.first()).toBeVisible();
  await settleAnimations(page);
  const violations = await analyze(page, scope, options.skip ?? {}, options.only);
  const where = scope ? `${page.url()} (${scope.toString()})` : page.url();
  expect(violations.length, `axe found ${String(violations.length)} violation(s) on ${where}:\n${report(violations)}`).toBe(0);
}
