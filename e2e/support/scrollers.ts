import type { Page } from "@playwright/test";

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
