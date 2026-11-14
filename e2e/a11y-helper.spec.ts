import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * The axe helper itself (e2e/support/a11y.ts), on inline pages with no
 * server: a rule skipped `{ on }` a selector is left out only on the nodes
 * that selector matches, never on what sits inside them; and a scan told to
 * run `only` some rules reports those and nothing else.
 */

// An icon button with no name fails axe's button-name rule.
const unnamedButton = `<button type="button"><svg width="16" height="16" aria-hidden="true"></svg></button>`;

const skipOnZone = { "button-name": { on: ".skip-zone", reason: "this test checks where a narrowed skip applies" } };

test("should leave a skipped rule out on the node its selector matches", async ({ page }) => {
  await page.setContent(`<main id="scan">${unnamedButton.replace("<button", `<button class="skip-zone"`)}</main>`);
  await expectNoAxeViolations(page.locator("#scan"), { skip: skipOnZone });
});

test("should still report a skipped rule on a node inside what its selector matches", async ({ page }) => {
  await page.setContent(`<main id="scan"><div class="skip-zone">${unnamedButton}</div></main>`);
  await expect(expectNoAxeViolations(page.locator("#scan"), { skip: skipOnZone })).rejects.toThrow(/button-name/);
});

// Grey text on white at about 2.3:1 fails axe's color-contrast rule.
const faintText = `<p style="color: #aaaaaa; background: #ffffff">Hard to read</p>`;

test("should report a rule the scan is told to run alone", async ({ page }) => {
  await page.setContent(`<main id="scan">${faintText}${unnamedButton}</main>`);
  await expect(expectNoAxeViolations(page.locator("#scan"), { only: ["color-contrast"] })).rejects.toThrow(/color-contrast/);
});

test("should leave every other rule out when the scan is told to run one alone", async ({ page }) => {
  await page.setContent(`<main id="scan">${unnamedButton}</main>`);
  await expectNoAxeViolations(page.locator("#scan"), { only: ["color-contrast"] });
});

test("should not run a rule skipped on some nodes when the scan is told to run another alone", async ({ page }) => {
  await page.setContent(`<main id="scan"><div class="skip-zone">${unnamedButton}</div></main>`);
  await expectNoAxeViolations(page.locator("#scan"), { only: ["color-contrast"], skip: skipOnZone });
});

test("should list what a rule could not judge on the test when the scan runs it alone", async ({ page }) => {
  // Text over a background image: axe cannot read the backdrop, so the node is neither a pass nor a violation.
  const pixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  await page.setContent(`<main id="scan"><p style="background-image: url(${pixel}); color: #777777">Over an image</p></main>`);
  await expectNoAxeViolations(page.locator("#scan"), { only: ["color-contrast"] });
  expect(test.info().annotations.filter((note) => note.type === "axe could not judge").map((note) => note.description).join(" ")).toContain("color-contrast on 1 node(s)");
});
