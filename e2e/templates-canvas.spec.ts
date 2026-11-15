import { expectNoAxeViolations } from "./support/a11y";
import { board, frame } from "./support/canvas";
import { expect, test } from "./support/test";

/*
 * One screen of section templates (a navbar, and questions with the first
 * one open) in three canvas frames, as an agent lays a page out at three
 * widths. Everything the screen names is on the page three times. A view
 * that marks a part as a landmark would give the page three landmarks with
 * one name, which axe reports as `landmark-unique`; an open accordion panel
 * did, until it became a group named by its button.
 */

const frames = ["screen-desktop", "screen-tablet", "screen-phone"] as const;
const firstQuestion = "How long is the free trial?";

test("should pass axe on a canvas that shows one screen in three frames, with each open panel a group and no landmark repeated", async ({ page, isMobile }) => {
  await page.goto("/dev/canvas?fixture=screens");
  await expect(board(page)).toHaveAttribute("data-canvas-board", isMobile ? "stacked" : "board");
  for (const id of frames) {
    // Each frame is a group named by the frame, and holds its own copy of the screen's named parts.
    await expect(frame(page, id).getByRole("group", { name: "Site navigation" })).toHaveCount(1);
    const question = frame(page, id).getByRole("button", { name: firstQuestion });
    await expect(question).toHaveAttribute("aria-expanded", "true");
    await expect(frame(page, id).getByRole("group", { name: firstQuestion })).toContainText("The trial lasts 30 days");
  }
  // Three open panels with one name: as regions they were three landmarks, which is what failed.
  await expect(board(page).getByRole("region", { name: firstQuestion })).toHaveCount(0);
  await expect(board(page).getByRole("group", { name: firstQuestion })).toHaveCount(frames.length);
  await page.evaluate(() => document.fonts.ready);
  await expectNoAxeViolations(page);
});
