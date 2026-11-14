import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

/*
 * Accessibility checks for the e2e specs: axe-core's rules run against a page
 * or one part of it, in the state the spec put it in (a menu open, an item
 * highlighted). Use it after the state is on screen, and pair it with
 * `toMatchAriaSnapshot` where the accessibility tree itself is the point.
 */

/** A rule switched off for one scan, with the reason in one line. */
export type SkippedRules = Readonly<Record<string, string>>;

interface ScanOptions {
  /** Rules this scan leaves out, each with why: `{ "color-contrast": "…" }`. Name the reason; never skip silently. */
  skip?: SkippedRules;
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
    const finite = document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function analyze(page: Page, scope: Locator | null, skip: SkippedRules) {
  const skipped = Object.keys(skip);
  if (!scope) return new AxeBuilder({ page }).disableRules(skipped).analyze();
  const token = `scan-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
  await scope.evaluateAll((elements, value) => { for (const element of elements) element.setAttribute("data-a11y-scan", value); }, token);
  try {
    return await new AxeBuilder({ page })
      .include(`[${scanAttribute}="${token}"]`)
      .disableRules([...pageStructureRules, ...skipped])
      .analyze();
  } finally {
    await scope.evaluateAll((elements) => { for (const element of elements) element.removeAttribute("data-a11y-scan"); }).catch(() => undefined);
  }
}

/**
 * Runs axe on the page, or only on what `target` matches when it is a
 * locator, and fails with every violation listed: the rule id, its help text
 * and link, and each failing node's selector with what is wrong. Rules in
 * `options.skip` are left out of this scan only, each with its reason.
 */
export async function expectNoAxeViolations(target: Page | Locator, options: ScanOptions = {}): Promise<void> {
  const isPage = "goto" in target;
  const page = isPage ? target : target.page();
  const scope = isPage ? null : target;
  if (scope) await expect(scope.first()).toBeVisible();
  await settleAnimations(page);
  const { violations } = await analyze(page, scope, options.skip ?? {});
  const where = scope ? `${page.url()} (${scope.toString()})` : page.url();
  expect(violations.length, `axe found ${String(violations.length)} violation(s) on ${where}:\n${report(violations)}`).toBe(0);
}
