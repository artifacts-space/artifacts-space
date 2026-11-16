import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";

/*
 * llms.txt, and the docs' order now that new visual work is an HTML page:
 * the earlier formats' docs (JSON Render) come last, under their own
 * section, and the docs home no longer leads with them.
 */

const sections = ["Get started", "Reference", "Work together", "Run it", "Earlier formats"];

/** The origin llms.txt writes its links with: the site's configured one, which the dev server does not serve from. */
function linkOrigin(text: string): string {
  return /\]\((\S+?)\/docs\/quickstart\)/.exec(text)?.[1] ?? "";
}

test("should serve llms.txt as plain text to a signed-out reader", async ({ request }) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("text/plain; charset=utf-8");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  const text = await response.text();
  expect(text.startsWith("# artifacts.space\n\n> ")).toBe(true);
  const origin = linkOrigin(text);
  expect(origin).toMatch(/^https?:\/\/[^/]+$/);
  expect(text).toContain(`- [Quickstart](${origin}/docs/quickstart): `);
  expect(text).toContain("- `html`: ");
  const optional = text.indexOf("## Optional");
  expect(optional).toBeGreaterThan(-1);
  expect(text.slice(0, optional)).not.toContain("json-render");
  expect(text.slice(optional)).toContain(`${origin}/docs/json-render)`);
});

test("should link every page llms.txt names to a page that answers", async ({ request }) => {
  const text = await (await request.get("/llms.txt")).text();
  const origin = linkOrigin(text);
  const paths = [...text.matchAll(/\]\((\S+)\)/g)].flatMap((match) => (match[1]?.startsWith(origin) ? [new URL(match[1]).pathname] : []));
  expect(paths.length).toBeGreaterThan(10);
  for (const path of paths) expect((await request.get(path)).status(), path).toBe(200);
});

test("should list the earlier formats' docs last in the docs menu, with every page still linked", async ({ page, isMobile }) => {
  await page.goto("/docs");
  if (isMobile) await page.getByRole("button", { name: "Open docs menu" }).click();
  const menu = page.getByRole("navigation", { name: "Docs" }).filter({ visible: true });
  await expect(menu).toBeVisible();
  expect(await menu.locator(":scope > div > p").allTextContents()).toEqual(sections);

  const hrefs = await menu.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const firstEarlier = hrefs.findIndex((href) => href.startsWith("/docs/json-render"));
  expect(firstEarlier).toBeGreaterThan(-1);
  expect(hrefs.slice(0, firstEarlier).filter((href) => href.includes("json-render"))).toEqual([]);
  expect(hrefs.slice(firstEarlier).every((href) => href.startsWith("/docs/json-render"))).toBe(true);
  expect(hrefs.indexOf("/docs/self-hosting")).toBe(firstEarlier - 1);
  await expectNoAxeViolations(menu);
});

test("should lead the docs home with the current formats and send visual work to a web page", async ({ page }) => {
  await page.goto("/docs");
  const article = page.locator("[data-docs-article]");
  const formats = article.getByRole("table").first();
  const kinds = await formats.locator("tbody tr td:first-child").allTextContents();
  expect(kinds).toContain("html");
  expect(kinds).not.toContain("ui");
  expect(kinds).not.toContain("canvas");

  const cards = article.locator("div.grid > a.card-surface");
  expect(await cards.locator("span:first-child").allTextContents()).toEqual(["Quickstart", "Formats", "MCP reference", "Sharing, teams, and agents"]);
  await expect(article.getByText("before you write a web page")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("should show the quickstart's web page step, under a heading its links can reach", async ({ page }) => {
  await page.goto("/docs/quickstart#first-page");
  const heading = page.getByRole("heading", { name: "Make a web page" });
  await expect(heading).toBeInViewport();
  await expect(page.locator("figure[data-code-block]").filter({ hasText: 'kind "html"' })).toBeVisible();
  await expect(page.locator("[data-docs-article]")).not.toContainText('kind "ui"');
});

test("should name the earlier formats' section above the JSON Render title and keep its page reachable", async ({ page }) => {
  await page.goto("/docs/json-render");
  const article = page.locator("[data-docs-article]");
  await expect(article.locator("p").first()).toHaveText("Earlier formats");
  await expect(article.locator(":scope > h1")).toHaveText("JSON Render");
  await expect(article.getByRole("link", { name: "HTML page" })).toHaveAttribute("href", "/docs/formats#html");
  expect(await page.locator('meta[name="robots"]').count()).toBe(0);
});
