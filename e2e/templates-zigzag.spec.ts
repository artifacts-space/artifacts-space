import type { Locator, Page } from "@playwright/test";

import { uiTemplates } from "../src/lib/ui/templates/index";

import { expect, test } from "./support/test";

/*
 * The one behavior the feature-zigzag template exists for, which the loops
 * in templates.spec.ts cannot see: its picture changes sides from row to
 * row in a wide frame, and comes after the words in a phone frame. The
 * template draws each picture with three elements and shows one of them, so
 * the tests also count the pictures a reader meets in each row.
 */

const id = "feature-zigzag";

interface Row {
  title: string;
  image: string;
  points: string[];
  pictureFirst?: boolean;
}

/** The rows the template ships with, read from its state so the test follows the template's own words. */
function rowsOf(): Row[] {
  const template = uiTemplates.find((entry) => entry.id === id);
  const rows = template?.fragment.state?.rows;
  if (!Array.isArray(rows)) throw new Error(`${id} has no rows in its state.`);
  return rows as Row[];
}

const rows = rowsOf();

async function frameOf(page: Page, width: 1440 | 390): Promise<Locator> {
  await page.goto(`/dev/templates?template=${id}`);
  await expect(page.locator("[data-templates-ready]")).toBeAttached({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  const frame = page.locator(`[data-template="${id}"]:visible [data-template-frame="${String(width)}"]`);
  await frame.scrollIntoViewIfNeeded();
  return frame;
}

/** Where a row's title, last point, and picture sit, after checking that the row shows its picture exactly once. */
async function placesOf(frame: Locator, row: Row) {
  const picture = frame.getByRole("img", { name: row.image, exact: true });
  await expect(picture, `pictures a reader meets in the row "${row.title}"`).toHaveCount(1);
  const [title, lastPoint, image] = await Promise.all([
    frame.getByRole("heading", { name: row.title, exact: true }).boundingBox(),
    frame.getByText(row.points.at(-1) ?? "", { exact: true }).boundingBox(),
    picture.boundingBox(),
  ]);
  if (!title || !lastPoint || !image) throw new Error(`The row "${row.title}" is missing its title, its points, or its picture.`);
  return { title, lastPoint, image };
}

test("should have rows with the picture on the right and rows with it on the left, in turn, when the template ships", () => {
  // The tests below would prove nothing if every row sat the same way, or if no row relied on the default.
  expect(rows.map((row) => row.pictureFirst === true)).toEqual([false, true, false]);
  expect(rows.filter((row) => row.pictureFirst === undefined).length).toBeGreaterThan(0);
});

test("should draw one picture in each row, beside the words, and change its side from row to row when the frame is 1440 wide", async ({ page }) => {
  const frame = await frameOf(page, 1440);
  for (const row of rows) {
    const { title, image } = await placesOf(frame, row);
    const side = image.x < title.x ? "left" : "right";
    expect(side, `the picture of "${row.title}"`).toBe(row.pictureFirst === true ? "left" : "right");
    // Beside the words, not above or below them: the two overlap in height.
    expect(image.y, `the picture of "${row.title}" starts above the end of its title`).toBeLessThan(title.y + title.height);
    expect(image.y + image.height, `the picture of "${row.title}" ends below the start of its title`).toBeGreaterThan(title.y);
  }
});

test("should draw one picture in each row, after the words, when the frame is 390 wide", async ({ page }) => {
  const frame = await frameOf(page, 390);
  for (const row of rows) {
    const { title, lastPoint, image } = await placesOf(frame, row);
    expect(title.y, `the title of "${row.title}" comes before its picture`).toBeLessThan(image.y);
    expect(image.y, `the picture of "${row.title}" comes after its last point`).toBeGreaterThanOrEqual(lastPoint.y + lastPoint.height);
  }
});
