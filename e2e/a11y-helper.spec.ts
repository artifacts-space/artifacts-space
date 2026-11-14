import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * The axe helper itself (e2e/support/a11y.ts), on inline pages with no
 * server: a rule skipped `{ on }` a selector is left out only on the nodes
 * that selector matches, never on what sits inside them.
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
