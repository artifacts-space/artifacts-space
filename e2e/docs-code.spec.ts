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

/** The json-render pages: standalone code blocks and the JSON under every live example. */
const highlightedDocsPages = ["/docs/json-render", "/docs/json-render/dynamic", "/docs/json-render/charts", "/docs/json-render/guarantees"];

for (const path of highlightedDocsPages) {
  test(`should highlight every code block, live example JSON included, when ${path} renders`, async ({ page }) => {
    await page.goto(path);
    const blocks = page.locator("main pre");
    expect(await blocks.count()).toBeGreaterThan(0);
    const plain = await blocks.evaluateAll((pres) =>
      pres.filter((pre) => !pre.querySelector('[class*="text-syntax-"]')).map((pre) => pre.textContent.slice(0, 60)),
    );
    expect(plain, "code blocks without syntax colors").toEqual([]);
    const sources = page.locator("[data-docs-example] [data-code-block] pre");
    expect(await sources.count()).toBeGreaterThan(0);
  });
}

test("should show the live example JSON toggle in sentence case with no focus ring when clicked", async ({ page }) => {
  await page.goto("/docs/json-render");
  const example = page.locator('[data-docs-example="Hello, artifacts"]');
  const summary = example.locator("summary");
  await expect(summary.getByText("Hide JSON")).toBeVisible();
  await summary.click();
  await expect(summary.getByText("Show JSON")).toBeVisible();
  await expect(summary.getByText("Hide JSON")).toBeHidden();
  await expect(summary).toBeFocused();
  await expect(summary).toHaveCSS("outline-style", "none");
  await expect(summary).toHaveCSS("box-shadow", "none");

  // Back to the toggle from the keyboard: now the standard ring shows.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(summary).toBeFocused();
  await expect(summary).not.toHaveCSS("box-shadow", "none");
});

for (const theme of ["light", "dark"] as const) {
  test(`should set inline code apart from the paragraph around it when the theme is ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => { window.localStorage.setItem("theme", value); }, theme);
    await page.goto("/docs/json-render");
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    const code = page.locator("main .artifact-prose p code").first();
    await expect(code).toHaveText("ui");

    const styles = await code.evaluate((element) => {
      /** The first painted background at or above an element. */
      const backgroundOf = (start: Element | null): string => {
        for (let node = start; node; node = node.parentElement) {
          const color = getComputedStyle(node).backgroundColor;
          if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const own = getComputedStyle(element);
      return {
        code: own.backgroundColor,
        paragraph: backgroundOf(element.parentElement),
        border: own.borderTopWidth,
        font: own.fontFamily,
        size: Number.parseFloat(own.fontSize),
        paragraphSize: Number.parseFloat(getComputedStyle(element.parentElement ?? element).fontSize),
      };
    });
    expect(styles.code).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.code).not.toBe(styles.paragraph);
    expect(styles.border).toBe("1px");
    expect(styles.font).toMatch(/mono/i);
    expect(styles.size).toBeLessThan(styles.paragraphSize);
    expect(styles.size).toBeGreaterThanOrEqual(13);
  });
}
