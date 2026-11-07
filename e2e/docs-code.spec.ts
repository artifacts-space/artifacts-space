import { expect, test } from "@playwright/test";

const skillCommand = "npx skills add artifacts-space/skills";

test("should copy exactly the command, without the prompt, when the copy button is pressed", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are a Chromium feature");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs/quickstart");

  const command = page.locator('[data-variant="command"]').filter({ hasText: skillCommand });
  await expect(command).toBeVisible();
  await expect(command).toContainText("$");
  await command.getByRole("button", { name: "Copy skill command" }).click();

  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(skillCommand);
});

test("should copy the code without its title when a titled block's copy button is pressed", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are a Chromium feature");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs/quickstart");

  const block = page.locator("figure[data-code-block]").filter({ hasText: "tools/call" });
  await block.getByRole("button", { name: "Copy code" }).click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.startsWith("{")).toBe(true);
  expect(copied).not.toContain("tools/call");
  expect(JSON.parse(copied)).toMatchObject({ name: "artifacts_create" });
});

test("should send docs code already highlighted when the page is rendered on the server", async ({ request }) => {
  const response = await request.get("/docs/clients");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain('data-variant="command"');
  expect(html).toContain("text-syntax-string");
});
