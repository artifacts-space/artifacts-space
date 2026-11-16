import type { Locator, Page } from "@playwright/test";
import { expect } from "./test";

/*
 * Opens the component gallery with only what a test reads. The whole gallery
 * takes many seconds to draw and hydrate, longest on a CI runner, so a test
 * names the groups (a section's id, such as "Input" or "specs") or single
 * specimens ("specs/Sign-in screen") it checks, and the page draws those
 * alone (`?show=`, src/components/dev/gallery-filter.ts). The whole page is
 * still drawn by gallery.spec.ts and scanned by a11y-contrast.spec.ts.
 */

/** One specimen of a gallery group, by the group's id and the specimen's name. */
export const specimen = (page: Page, group: string, name: string): Locator => page.locator(`section#${group} [data-specimen="${name}"]`);

/** The gallery's address for these groups and specimens, scrolled to the first group. */
export function galleryPath(shown: readonly string[]): string {
  const query = shown.map((value) => `show=${encodeURIComponent(value)}`).join("&");
  const first = shown[0]?.split("/")[0];
  return `/dev/components?${query}${first ? `#${first}` : ""}`;
}

/**
 * Opens the gallery with only these groups and specimens, and waits until
 * React has hydrated it, which its ready mark says. The server's HTML is on
 * screen before that, and a scan writes a marker on what it scans: on HTML
 * React has yet to check, that is a hydration mismatch. Fails at once,
 * naming it, when a group or specimen asked for is not on the page.
 */
export async function openGallery(page: Page, shown: readonly string[]): Promise<void> {
  await page.goto(galleryPath(shown));
  await expect(page.locator("[data-gallery-ready]")).toBeAttached({ timeout: 60_000 });
  for (const value of shown) {
    const slash = value.indexOf("/");
    const found = slash === -1 ? page.locator(`section#${value}`) : specimen(page, value.slice(0, slash), value.slice(slash + 1));
    await expect(found, `gallery has "${value}"`).not.toHaveCount(0);
  }
}
