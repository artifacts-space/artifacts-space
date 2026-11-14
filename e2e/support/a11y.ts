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

/** Marks the elements a locator matches so axe can be told to scan only them. */
const scanAttribute = "data-a11y-scan";

interface Violation {
  id: string;
  help: string;
  helpUrl: string;
  nodes: { target: unknown[]; failureSummary?: string | undefined }[];
}

/** One line per violation, then one indented line per failing node: its selector and what is wrong. */
function report(violations: readonly Violation[]): string {
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

/** A builder for one scan: the whole page, or only the marked part. */
function builder(page: Page, token: string | null): AxeBuilder {
  const axe = new AxeBuilder({ page });
  return token ? axe.include(`[${scanAttribute}="${token}"]`) : axe;
}

/**
 * Drops the failing nodes that `selector` matches themselves, and any
 * violation left with none. A node inside a match is still reported. Filtered
 * after the run, because axe's own `exclude` cannot take out a node the scan
 * was told to include.
 */
async function withoutNodesOn(page: Page, violations: readonly Violation[], selector: string): Promise<Violation[]> {
  const kept: Violation[] = [];
  for (const violation of violations) {
    const targets = violation.nodes.map((node) => {
      const last = node.target.at(-1);
      return typeof last === "string" ? last : "";
    });
    const skipped = await page.evaluate(({ list, on }) => list.map((target) => target !== "" && document.querySelector(target)?.matches(on) === true), { list: targets, on: selector });
    const nodes = violation.nodes.filter((_, index) => skipped[index] !== true);
    if (nodes.length > 0) kept.push({ ...violation, nodes });
  }
  return kept;
}

/**
 * Records, on the running test, the nodes a rule could not judge either way
 * (axe's `incomplete`): the rule, how many, and the first few selectors. A
 * scan passes without them, so the report says what it did not prove.
 */
function noteUnjudged(page: Page, incomplete: readonly Violation[]): void {
  for (const entry of incomplete) {
    if (entry.nodes.length === 0) continue;
    const first = entry.nodes.slice(0, 5).map((node) => node.target.map(String).join(" >> "));
    test.info().annotations.push({ type: "axe could not judge", description: `${entry.id} on ${String(entry.nodes.length)} node(s) at ${page.url()}: ${first.join("; ")}` });
  }
}

/**
 * Runs every rule but the skipped ones (and, on a part, the page-structure
 * ones), or only the rules in `only`, then each rule skipped only on some
 * nodes, everywhere but there.
 */
async function runRules(page: Page, token: string | null, skip: SkippedRules, only: readonly string[] | undefined): Promise<Violation[]> {
  const entries = Object.entries(skip);
  const skipped = entries.map(([rule]) => rule);
  const left = [...(token ? pageStructureRules : []), ...skipped];
  const scan = only ? builder(page, token).withRules(only.filter((rule) => !left.includes(rule))) : builder(page, token).disableRules(left);
  const main = await scan.analyze();
  if (only) noteUnjudged(page, main.incomplete);
  const violations: Violation[] = [...main.violations];
  // One after another: axe cannot run twice at once in a page.
  for (const [rule, why] of entries) {
    if (typeof why === "string" || (only && !only.includes(rule))) continue;
    const narrowed = await builder(page, token).withRules([rule]).analyze();
    violations.push(...(await withoutNodesOn(page, narrowed.violations, why.on)));
  }
  return violations;
}

async function analyze(page: Page, scope: Locator | null, skip: SkippedRules, only: readonly string[] | undefined): Promise<Violation[]> {
  if (!scope) return runRules(page, null, skip, only);
  const token = `scan-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
  await scope.evaluateAll((elements, value) => { for (const element of elements) element.setAttribute("data-a11y-scan", value); }, token);
  try {
    return await runRules(page, token, skip, only);
  } finally {
    await scope.evaluateAll((elements) => { for (const element of elements) element.removeAttribute("data-a11y-scan"); }).catch(() => undefined);
  }
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
