import { allowPageError, expect, test } from "./support/test";

import { BOT_SUSPECTED_CODE, BOT_SUSPECTED_MESSAGE } from "../src/lib/abuse/bot-check-rules";

/**
 * The sign-in form when the server refuses a sign-in link request as a
 * suspected bot: the form shows the server's words, which name another way
 * in, and keeps the address. The route is answered with the 403 the server
 * sends (its body is pinned by src/app/api/auth/[...all]/route.test.ts), so
 * no deployment or bot check is needed.
 */
test("should show the way on and keep the address when a sign-in link request is refused as a bot", async ({ page }) => {
  allowPageError("/api/auth/sign-in/magic-link", "The test answers the sign-in link request with the bot refusal on purpose.");
  await page.route("**/api/auth/sign-in/magic-link", (route) => route.fulfill({ status: 403, json: { code: BOT_SUSPECTED_CODE, message: BOT_SUSPECTED_MESSAGE } }));
  await page.goto("/sign-in");
  const field = page.getByLabel("Email");
  await field.fill("ada@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();

  // Next's route announcer is an empty alert too, so pick the form's by its text.
  await expect(page.getByRole("alert").filter({ hasText: "We could not confirm" })).toHaveText(BOT_SUSPECTED_MESSAGE);
  await expect(field).toHaveValue("ada@example.com");
  await expect(page.getByRole("heading", { name: "Check your email" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /GitHub/ })).toBeEnabled();
});
