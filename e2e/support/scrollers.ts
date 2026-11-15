import type { Locator, Page } from "@playwright/test";

import { expect } from "./test";

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
 * Waits until every diagram in `scope` has been drawn and every box in it
 * that scrolls is a named tab stop. A diagram draws after the page loads,
 * and only then is its frame as wide as it will be, so an axe scan that
 * runs sooner can pass or fail by luck.
 */
export async function expectScrollersSettled(scope: Locator): Promise<void> {
  await expect(scope.locator("[data-diagram-frame]:not([data-diagram-drawn])")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => unreachableScrollersIn(scope)).toEqual([]);
}
