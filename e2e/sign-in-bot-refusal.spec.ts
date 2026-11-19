import { allowPageError, expect, test } from "./support/test";

import { BOT_SUSPECTED_CODE, BOT_SUSPECTED_MESSAGE, signInLinkWaitMs } from "../src/lib/abuse/bot-check-rules";

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

/**
 * The bot check replaces window.fetch after the page has loaded and adds the
 * browser's proof to the sign-in link request there. The form's request must
 * go through that replaced function: an auth client that kept the fetch from
 * when its module loaded sent no proof, and a deployment refused every
 * person (#252). Here a stand-in replaces fetch the same way and adds a
 * header; the request the form sends must carry it.
 */
test("should send the sign-in link request through a fetch that was replaced after the page loaded, as the bot check does", async ({ page }) => {
  let proof: string | undefined;
  await page.route("**/api/auth/sign-in/magic-link", (route) => {
    proof = route.request().headers()["x-replaced-fetch"];
    return route.fulfill({ status: 200, json: { status: true } });
  });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.evaluate(() => {
    const before = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set("x-replaced-fetch", "1");
      return before(input, { ...init, headers });
    };
  });
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(proof).toBe("1");
});

/**
 * At Deep Analysis the browser waits for the bot check's script before it
 * sends the request, and that wait has no end of its own. The form's does:
 * with no answer in time it stops being busy and shows the way on. Here the
 * request is held for good and the page's clock is moved past the wait.
 */
test("should stop waiting and show the way on when the sign-in link request never gets an answer", async ({ page }) => {
  await page.route("**/api/auth/sign-in/magic-link", () => new Promise<void>(() => undefined));
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("ada@example.com");
  const send = page.getByRole("button", { name: "Email me a sign-in link" });
  // Only the form's wait needs a clock the test can move: the page loads and hydrates on real time.
  await page.clock.install();
  await send.click();
  await expect(send).toBeDisabled();

  await page.clock.fastForward(signInLinkWaitMs + 1000);
  await expect(page.getByRole("alert").filter({ hasText: "We could not confirm" })).toHaveText(BOT_SUSPECTED_MESSAGE);
  await expect(send).toBeEnabled();
  await expect(page.getByLabel("Email")).toHaveValue("ada@example.com");
});
