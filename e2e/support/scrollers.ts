import type { Locator, Page, TestInfo } from "@playwright/test";

import { expect, test } from "./test";

/**
 * Every box on the page that scrolls sideways and is not a named group with a
 * tab stop (scroll-stop.ts), described by its tag and classes. Empty when the
 * keyboard can reach every one.
 *
 * A box learns that it scrolls by measuring itself in the browser, after
 * React has taken the page over, so poll this before an axe scan of a page
 * with code blocks or tables: `await expect.poll(() =>
 * unreachableSidewaysScrollers(page)).toEqual([])`. A scan that runs sooner
 * reports `scrollable-region-focusable` on a slow machine and passes on a
 * fast one.
 */
export async function unreachableSidewaysScrollers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) continue;
      const overflow = getComputedStyle(element).overflowX;
      if ((overflow !== "auto" && overflow !== "scroll") || element.scrollWidth <= element.clientWidth + 1) continue;
      const named = element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
      if (element.getAttribute("role") === "group" && element.tabIndex === 0 && named) continue;
      offenders.push(`${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`);
    }
    return offenders;
  });
}

/**
 * Every box inside `scope`, or `scope` itself, that scrolls either way and
 * is not a named group with a tab stop, described by its tag and classes.
 * Unlike `unreachableSidewaysScrollers` it also counts boxes that scroll
 * down (a long source listing, a chart's table).
 */
export async function unreachableScrollersIn(scope: Locator): Promise<string[]> {
  return scope.evaluate((root) => {
    const scrollable = (overflow: string) => overflow === "auto" || overflow === "scroll";
    const scrolls = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const sideways = scrollable(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
      return sideways || (scrollable(style.overflowY) && element.scrollHeight > element.clientHeight + 1);
    };
    const reachable = (element: HTMLElement) =>
      element.getAttribute("role") === "group" && element.tabIndex === 0 && (element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby"));
    return [root, ...root.querySelectorAll("*")]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && scrolls(element) && !reachable(element))
      .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`);
  });
}

/**
 * How long a diagram may take to draw after the page is ready. Drawing
 * starts only once React has taken the page over: Mermaid's code loads,
 * the font is read, and diagrams draw one at a time. On a phone, from the
 * gallery's ready mark to the first diagram's end, this took 1.9 s at full
 * speed, 12 s with the CPU slowed four times, and 27 s slowed eight times;
 * a CI runner sits in between. The default 5 s wait passed or failed by
 * the runner's speed.
 */
export const diagramDrawTimeout = 60_000;

/** Words that pick out each diagram still drawing: its gallery specimen, its caption, and its first words. */
function describeDiagrams(drawing: Locator): Promise<string[]> {
  return drawing.evaluateAll((elements) => {
    const squeeze = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const describe = (element: Element, index: number) => {
      const parts = [
        ["specimen", element.closest("[data-specimen]")?.getAttribute("data-specimen")],
        ["caption", element.closest("figure")?.querySelector("figcaption")?.textContent ?? element.querySelector("figcaption")?.textContent],
        ["words", element.textContent],
      ].flatMap(([kind, text]) => (squeeze(text) ? [`${String(kind)} "${squeeze(text)}"`] : []));
      return parts.length > 0 ? parts.join(", ") : `diagram ${String(index + 1)}, which shows no words yet`;
    };
    return elements.map(describe);
  });
}

/** Tests whose time limit already grew for a diagram wait. */
const extendedForDiagrams = new WeakSet<TestInfo>();

/** Grows a test's time limit by one diagram wait, the first time only; a test with no limit keeps none. */
function allowOneDiagramWait(info: TestInfo, timeout: number) {
  if (info.timeout === 0 || extendedForDiagrams.has(info)) return;
  extendedForDiagrams.add(info);
  info.setTimeout(info.timeout + Math.max(timeout, diagramDrawTimeout));
}

/**
 * Waits until no diagram in `scope` is still drawing: each is drawn or
 * has failed (`data-diagram-state`, set by every diagram view). A diagram
 * in a document draws only once it nears the window, so scroll such a
 * one into view first.
 *
 * The test's own time limit grows once by the longest wait, however many
 * times a test calls this, so a diagram that never draws fails here, naming
 * the diagram, and not later as a test timeout.
 */
export async function expectDiagramsSettled(scope: Locator, timeout = diagramDrawTimeout): Promise<void> {
  allowOneDiagramWait(test.info(), timeout);
  const drawing = scope.locator('[data-diagram-state="drawing"]');
  try {
    await expect(drawing).toHaveCount(0, { timeout });
  } catch (error) {
    const stuck = await describeDiagrams(drawing);
    if (stuck.length === 0) throw error;
    throw new Error(`Still drawing after ${String(timeout / 1000)} s: ${stuck.join("; ")}`, { cause: error });
  }
}

/**
 * Waits until every diagram in `scope` has finished drawing and every box
 * in it that scrolls is a named tab stop. Only a drawn diagram's frame is
 * as wide as it will be, so an axe scan that runs sooner can pass or fail
 * by luck.
 */
export async function expectScrollersSettled(scope: Locator): Promise<void> {
  await expectDiagramsSettled(scope);
  await expect.poll(() => unreachableScrollersIn(scope)).toEqual([]);
}
