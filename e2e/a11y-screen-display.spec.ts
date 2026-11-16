import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * The display pieces of a screen (AvatarGroup, Kbd, Rating), the Badge's
 * status dot, and the Input's icon: axe on each in the gallery and on its
 * docs page, the names screen readers get, and how each is laid out, on a
 * desktop and a phone. The contrast spec reads their text on every surface
 * of the "Surfaces and tones" specimen.
 */

const specimen = (page: Page, group: string, name: string) => page.locator(`section#${group} [data-specimen="${name}"]`);

/** The gallery is ready once React has hydrated it, which its ready mark says. */
async function galleryReady(page: Page, group: string) {
  await page.goto(`/dev/components#${group}`);
  await expect(page.locator("[data-gallery-ready]")).toBeAttached({ timeout: 60_000 });
}

const boxOf = (target: Locator) => target.evaluate((element) => {
  const { left, right, top, bottom, width } = element.getBoundingClientRect();
  return { left, right, top, bottom, width };
});

test("should pass axe on the AvatarGroup, Kbd, Rating, Badge, and Input groups of the gallery", async ({ page }) => {
  await galleryReady(page, "AvatarGroup");
  for (const group of ["AvatarGroup", "Kbd", "Rating", "Badge", "Input"]) {
    const section = page.locator(`section#${group}`);
    await section.scrollIntoViewIfNeeded();
    await expectNoAxeViolations(section);
  }
});

test("should give screen readers one name for each display piece, in words, and nothing for what is drawn", async ({ page }) => {
  await galleryReady(page, "AvatarGroup");
  // Each is one image to assistive technology: its circles and stars are not in the tree on their own.
  const named = [
    ["AvatarGroup", "Seven people, four shown", "7 people: Maya Chen, Omar Haddad, Priya Nair, Tomás de la Cruz, and 3 more"],
    ["AvatarGroup", "A sample of a larger group", "2,400 people: Maya Chen, Omar Haddad, Priya Nair, and 2,397 more"],
    ["Rating", "Four and a half", "Average rating: 4.5 out of 5"],
  ] as const;
  for (const [group, name, words] of named) {
    const images = specimen(page, group, name).getByRole("img");
    await expect(images, name).toHaveCount(1);
    await expect(images, name).toHaveAccessibleName(words);
  }
  await expect(specimen(page, "Kbd", "Control Shift P")).toMatchAriaSnapshot(`
    - text: Control Shift P
  `);
  await expect(specimen(page, "Badge", "Dot alone")).toMatchAriaSnapshot(`
    - text: Unread
  `);
});

test("should tuck each avatar under the one before it, and keep the row inside a phone-wide frame", async ({ page }) => {
  await galleryReady(page, "AvatarGroup");
  const seven = specimen(page, "AvatarGroup", "Seven people, four shown");
  await seven.scrollIntoViewIfNeeded();
  const circles = await seven.locator("[data-avatar-person], [data-avatar-more]").all();
  expect(circles).toHaveLength(5);
  const boxes = await Promise.all(circles.map(boxOf));
  for (let index = 1; index < boxes.length; index += 1) {
    const [before, after] = [boxes[index - 1], boxes[index]];
    if (!before || !after) continue;
    expect(after.left, `circle ${String(index + 1)} starts inside the one before it`).toBeLessThan(before.right);
    expect(after.left, `circle ${String(index + 1)} starts after the one before it starts`).toBeGreaterThan(before.left);
  }
  const frame = specimen(page, "AvatarGroup", "A sample of a larger group");
  const row = await boxOf(frame.getByRole("img"));
  expect(row.right).toBeLessThanOrEqual((await boxOf(frame)).right + 1);
});

test("should draw an Input's icon inside the field, before where the text starts, and leave the label as its name", async ({ page }) => {
  await galleryReady(page, "Input");
  const fixture = specimen(page, "Input", "Search with an icon");
  await fixture.scrollIntoViewIfNeeded();
  const field = fixture.getByRole("searchbox", { name: "Search the docs" });
  await expect(field).toBeVisible();
  const icon = fixture.locator("[data-field-icon]");
  const [fieldBox, iconBox] = [await boxOf(field), await boxOf(icon)];
  const textStart = fieldBox.left + Number.parseFloat(await field.evaluate((element) => getComputedStyle(element).paddingLeft));
  expect(iconBox.left).toBeGreaterThan(fieldBox.left);
  expect(iconBox.right).toBeLessThanOrEqual(textStart);
  expect(iconBox.top).toBeGreaterThanOrEqual(fieldBox.top);
  expect(iconBox.bottom).toBeLessThanOrEqual(fieldBox.bottom);
  // Typing goes into the field, past the icon.
  await field.fill("pricing");
  await expect(field).toHaveValue("pricing");
  // The password stand-in with an icon is still an image, with no field.
  const password = specimen(page, "Input", "Password stand-in with an icon");
  await expect(password.locator("input")).toHaveCount(0);
  await expect(password.getByRole("img", { name: "Password" })).toBeVisible();
});

test("should keep two metrics to a row in a phone-wide grid with narrowColumns 2, and four to a row where it is wide", async ({ page, isMobile }) => {
  await galleryReady(page, "Grid");
  const fixture = specimen(page, "Grid", "Two columns on a phone");
  await fixture.scrollIntoViewIfNeeded();
  const tops = async () => Promise.all([1, 2, 3, 4].map(async (index) => Math.round((await boxOf(fixture.getByText(`Narrow metric ${String(index)}`, { exact: true }))).top)));
  if (!isMobile) {
    const [first, ...rest] = await tops();
    for (const top of rest) expect(top, "four to a row where it is wide").toBe(first);
    // A phone-wide frame in a desktop window: the grid follows its interface's width.
    await fixture.evaluate((element) => { element.style.width = "390px"; });
  }
  await expect.poll(async () => {
    const [a, b, c, d] = await tops();
    return [a === b, c === d, (a ?? 0) < (c ?? 0)];
  }, { message: "two to a row, in two rows" }).toEqual([true, true, true]);
  await expectNoAxeViolations(fixture);
});

test("should give the wide card two of three columns where the grid is wide, and every card the full row in a phone-wide frame", async ({ page, isMobile }) => {
  await galleryReady(page, "Grid");
  const fixture = specimen(page, "Grid", "Feature grid, one wide card");
  await fixture.scrollIntoViewIfNeeded();
  const widths = async () => Promise.all((await fixture.locator("[data-grid-span]").all()).map(async (cell) => Math.round((await boxOf(cell)).width)));
  if (!isMobile) {
    const [wide = 0, ...rest] = await widths();
    for (const narrowCell of rest) expect(wide, "the wide card is two cells and a gap").toBeGreaterThan(narrowCell * 2);
    await expectNoAxeViolations(fixture);
    // A phone-wide frame in a desktop window: the grid follows its interface's width.
    await fixture.evaluate((element) => { element.style.width = "390px"; });
  }
  await expect.poll(async () => new Set(await widths()).size, { message: "every card as wide as the others: the full row" }).toBe(1);
  const grid = Math.round((await boxOf(fixture.locator('[data-slot="ui-grid"]'))).width);
  expect((await widths())[0]).toBe(grid);
  await expectNoAxeViolations(fixture);
});

for (const [slug, name] of [["avatar-group", "AvatarGroup"], ["kbd", "Kbd"], ["rating", "Rating"], ["badge", "Badge"], ["input", "Input"], ["grid", "Grid"], ["tabs", "Tabs"], ["accordion", "Accordion"]] as const) {
  test(`should pass axe on the ${slug} docs page, with its live examples drawn`, async ({ page }) => {
    await page.goto(`/docs/json-render/components/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
    await expect(page.getByText("could not be shown")).toHaveCount(0);
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
