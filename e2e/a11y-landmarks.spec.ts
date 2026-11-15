import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * A view names a part of itself as a group, never as a landmark: one screen
 * is often on a page more than once, and each copy would be one more
 * landmark with the same name. Steps and the Calendar's panel for a pressed
 * day were named sections; these read them as a browser exposes them, and
 * scan them with axe in each state.
 */

const group = (page: Page, name: string) => page.locator(`section#${name}`);
const specimen = (page: Page, name: string, fixture: string) => group(page, name).locator(`[data-specimen="${fixture}"]`);

/** The gallery is ready once React has hydrated it, which its ready mark says. */
async function galleryReady(page: Page, name: string) {
  await page.goto(`/dev/components#${name}`);
  await expect(page.locator("[data-gallery-ready]")).toBeAttached({ timeout: 60_000 });
  await group(page, name).scrollIntoViewIfNeeded();
}

/** Landmarks a view could draw: by role, or by an element that is one. A section or a form counts only when it is named. */
const landmarks = (scope: Locator) => scope.locator('[role=region], [role=navigation], [role=complementary], [role=search], [role=form], nav, aside, main, section[aria-label], section[aria-labelledby], form[aria-label], form[aria-labelledby]');

test("should draw every Steps specimen as a named group with no landmark inside", async ({ page }) => {
  await galleryReady(page, "Steps");
  const specimens = group(page, "Steps").locator("[data-specimen]");
  expect(await specimens.count()).toBeGreaterThan(1);
  await expect(landmarks(specimens)).toHaveCount(0);
  await expect(specimen(page, "Steps", "Runbook").getByRole("group", { name: "Set up a local copy" })).toBeVisible();
  await expect(specimen(page, "Steps", "Runbook").getByRole("group", { name: "Set up a local copy" }).getByRole("listitem").first()).toBeVisible();
  await expectNoAxeViolations(group(page, "Steps"));
});

test("should draw every Calendar specimen with no landmark inside", async ({ page }) => {
  await galleryReady(page, "Calendar");
  await expect(landmarks(group(page, "Calendar").locator("[data-specimen]"))).toHaveCount(0);
  await expectNoAxeViolations(group(page, "Calendar"));
});

test("should open a pressed day's events in a named group that its button controls, and close it again", async ({ page, isMobile }) => {
  test.skip(isMobile, "below 36rem the month is drawn as a list, which has no days to press");
  await galleryReady(page, "Calendar");
  const month = specimen(page, "Calendar", "Month, 15 events on one day");
  await month.scrollIntoViewIfNeeded();
  const more = month.getByRole("button", { name: /^\+\d+ more$/ });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(month.getByRole("group", { name: /^Events on / })).toHaveCount(0);

  await more.click();
  const panel = month.getByRole("group", { name: "Events on Thu, Nov 12, 2026" });
  await expect(panel).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  expect(await more.getAttribute("aria-controls")).toBe(await panel.getAttribute("id"));
  // Still a group once it is open, with its day as a heading and its events inside.
  await expect(landmarks(month)).toHaveCount(0);
  await expect(month.getByRole("region")).toHaveCount(0);
  await expect(panel.getByRole("heading").first()).toBeVisible();
  await expect(panel.getByText("Interview 15")).toBeVisible();
  await expectNoAxeViolations(month);

  await panel.getByRole("button", { name: "Close day" }).click();
  await expect(panel).toHaveCount(0);
  await expect(more).toHaveAttribute("aria-expanded", "false");
});

for (const slug of ["steps", "calendar"]) {
  test(`should pass axe on the ${slug} docs page, with its live examples drawn and no landmark inside them`, async ({ page }) => {
    await page.goto(`/docs/json-render/components/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(`^${slug}$`, "i"));
    await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
    await expect(page.getByText("could not be shown")).toHaveCount(0);
    const examples = page.locator(".\\@container\\/ui");
    expect(await examples.count()).toBeGreaterThan(0);
    await expect(landmarks(examples)).toHaveCount(0);
    // The props table scrolls sideways on a phone and becomes a tab stop once it has measured itself, which needs the page interactive.
    await expect(async () => {
      await expectNoAxeViolations(page, {
        skip: {
          "scrollable-region-focusable": {
            on: "details:not([open]) pre",
            reason: "the JSON under a closed Show JSON toggle is not drawn until it opens, so it cannot measure itself yet; every component page has it",
          },
        },
      });
    }).toPass({ timeout: 20_000 });
  });
}
