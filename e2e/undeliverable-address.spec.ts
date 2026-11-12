import { expect, test, type Page } from "@playwright/test";

import { UNDELIVERABLE_ADDRESS_CODE, UNDELIVERABLE_ADDRESS_MESSAGE } from "../src/lib/auth/undeliverable-address";

/**
 * The sign-in form when the address cannot receive mail: the form says so in
 * its own words, naming what was typed, keeps the address, and leaves the
 * cursor in the field to fix it. The sign-in route is answered with the 422
 * the server sends when Sendir refuses the address (its body is pinned by
 * src/app/api/auth/[...all]/undeliverable-address.test.ts), so no database
 * or Sendir is needed.
 */

/** Answers every sign-in link request with the server's undeliverable refusal, and records what was asked. */
async function refuseAddresses(page: Page) {
  const asked: unknown[] = [];
  await page.route("**/api/auth/sign-in/magic-link", async (route) => {
    asked.push(route.request().postDataJSON());
    await route.fulfill({ status: 422, json: { code: UNDELIVERABLE_ADDRESS_CODE, message: UNDELIVERABLE_ADDRESS_MESSAGE } });
  });
  return asked;
}

test("should name the typed address, keep it, and keep the cursor in the field when it cannot receive mail", async ({ page }) => {
  const asked = await refuseAddresses(page);
  await page.goto("/sign-in");
  const field = page.getByLabel("Email");
  await field.fill("sam@gmial.con");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();

  // Next's route announcer is an empty alert too, so pick the form's by its text.
  await expect(page.getByRole("alert").filter({ hasText: "We can't send email to" })).toHaveText("We can't send email to sam@gmial.con. Check it for a typo.");
  await expect(field).toHaveValue("sam@gmial.con");
  await expect(field).toBeFocused();
  await expect(page.getByRole("heading", { name: "Check your email" })).toHaveCount(0);
  expect(asked).toEqual([expect.objectContaining({ email: "sam@gmial.con" })]);
});

test("should show the typed address as text, never as markup, when it cannot receive mail", async ({ page }) => {
  await refuseAddresses(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("<b>sam</b>@gmial.con");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();

  const alert = page.getByRole("alert").filter({ hasText: "We can't send email to" });
  await expect(alert).toHaveText("We can't send email to <b>sam</b>@gmial.con. Check it for a typo.");
  await expect(alert.locator("b")).toHaveCount(0);
});
