import { expect, test } from "./support/test";

import { expectNoAxeViolations, retakenNote, unjudgedNote } from "./support/a11y";

/*
 * The axe helper itself (e2e/support/a11y.ts), on inline pages with no
 * server: a rule skipped `{ on }` a selector is left out only on the nodes
 * that selector matches, never on what sits inside them; a scan told to run
 * `only` some rules reports those and nothing else, lists once what they
 * could not judge, and fails when it is left with no rule to run.
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

// Text over a background image: axe cannot read the backdrop, so the node is neither a pass nor a violation.
const pixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const overImage = (className = "") => `<p class="${className}" style="background-image: url(${pixel}); color: #777777">Over an image</p>`;

/** What the running test's "axe could not judge" annotations say, one entry per annotation. */
const unjudgedNotes = () => test.info().annotations.filter((note) => note.type === unjudgedNote).map((note) => note.description ?? "");

test("should list what a rule could not judge on the test when the scan runs it alone", async ({ page }) => {
  await page.setContent(`<main id="scan">${overImage()}</main>`);
  await expectNoAxeViolations(page.locator("#scan"), { only: ["color-contrast"] });
  expect(unjudgedNotes()).toHaveLength(1);
  expect(unjudgedNotes()[0]).toContain("color-contrast on 1 node(s)");
});

test("should list what a rule could not judge outside the nodes it is skipped on when the scan runs it alone", async ({ page }) => {
  await page.setContent(`<main id="scan">${overImage("skip-zone")}${overImage("kept")}</main>`);
  const skip = { "color-contrast": { on: ".skip-zone", reason: "this test checks which unjudged nodes a narrowed skip still lists" } };
  await expectNoAxeViolations(page.locator("#scan"), { only: ["color-contrast"], skip });
  expect(unjudgedNotes()).toHaveLength(1);
  expect(unjudgedNotes()[0]).toContain("color-contrast on 1 node(s)");
  expect(unjudgedNotes()[0]).toContain(".kept");
  expect(unjudgedNotes()[0]).not.toContain(".skip-zone");
});

test("should list an unjudged node once when the same scan runs again, as a retried scan does", async ({ page }) => {
  await page.setContent(`<main id="scan">${overImage()}</main>`);
  for (let attempt = 0; attempt < 3; attempt += 1) await expectNoAxeViolations(page.locator("#scan"), { only: ["color-contrast"] });
  expect(unjudgedNotes()).toHaveLength(1);
});

test("should fail when the scan is told to run alone a rule that a scan of a part leaves out", async ({ page }) => {
  await page.setContent(`<main id="scan">${unnamedButton}</main>`);
  await expect(expectNoAxeViolations(page.locator("#scan"), { only: ["region"] })).rejects.toThrow(/runs no rule/);
});

test("should fail when the only rule the scan is told to run is skipped outright", async ({ page }) => {
  await page.setContent(`<main>${unnamedButton}</main>`);
  await expect(expectNoAxeViolations(page, { only: ["button-name"], skip: { "button-name": "this test checks a scan left with nothing to run" } })).rejects.toThrow(/runs no rule/);
});

test("should scan every element a locator matches, and nothing outside them", async ({ page }) => {
  await page.setContent(`<main><section class="part"><p>Fine</p></section><section class="part">${unnamedButton}</section><section class="outside">${unnamedButton}</section></main>`);
  await expect(expectNoAxeViolations(page.locator(".part"))).rejects.toThrow(/button-name/);
  await expectNoAxeViolations(page.locator("section.part").first());
  await expectNoAxeViolations(page.locator("p"));
});

/**
 * A page script that changes what sits above the part when the helper names
 * an element by its place in the tree: once, or every time. `move` is the
 * change, as page code.
 */
const movesWhenNamed = (every: boolean, move = `document.body.prepend(document.createElement("div"))`): string => `<script>
  const find = Document.prototype.querySelectorAll;
  let moved = false;
  Document.prototype.querySelectorAll = function (selector) {
    const found = find.call(this, selector);
    if ((${String(every)} || !moved) && String(selector).includes(":nth-child")) {
      moved = true;
      queueMicrotask(() => { ${move}; });
    }
    return found;
  };
</script>`;

const retaken = (): string[] => test.info().annotations.filter((note) => note.type === retakenNote).map((note) => note.description ?? "");

test("should scan the element again when the page moves it between naming it and the scan", async ({ page }) => {
  // After the move, the first name points at the new empty element: a scan that trusted it would pass.
  await page.setContent(`<main id="scan">${unnamedButton}</main>${movesWhenNamed(false)}`);
  await expect(expectNoAxeViolations(page.locator("#scan"))).rejects.toThrow(/button-name/);
  expect(retaken()).toHaveLength(1);
});

test("should scan the element again when its first name matches nothing by the time of the scan", async ({ page }) => {
  // The part is the body's second element; with the first one gone, its name matches nothing and axe refuses the scan.
  const removesTheFirst = movesWhenNamed(false, `document.getElementById("gone").remove()`);
  await page.setContent(`<html lang="en"><head><title>Moved</title>${removesTheFirst}</head><body><div id="gone"></div><main id="scan">${unnamedButton}</main></body></html>`);
  await expect(expectNoAxeViolations(page.locator("#scan"))).rejects.toThrow(/button-name/);
  expect(retaken()).toHaveLength(1);
});

test("should fail, and say why, when the page moves the element during every scan", async ({ page }) => {
  await page.setContent(`<main id="scan"><p>Fine</p></main>${movesWhenNamed(true)}`);
  await expect(expectNoAxeViolations(page.locator("#scan"))).rejects.toThrow(/moved its elements during each of 3 scans/);
});

test("should leave no note of a retaken scan when the page holds still", async ({ page }) => {
  await page.setContent(`<main id="scan"><p>Fine</p></main>`);
  await expectNoAxeViolations(page.locator("#scan"));
  expect(retaken()).toHaveLength(0);
});

test("should scan an element inside a shadow root when a locator matches it", async ({ page }) => {
  await page.setContent(`<main><div id="host"></div></main><script>document.getElementById("host").attachShadow({ mode: "open" }).innerHTML = '<div class="inner">${unnamedButton}</div>';</script>`);
  await expect(expectNoAxeViolations(page.locator(".inner"))).rejects.toThrow(/button-name/);
});

/*
 * A scan of a part of a page must not change that page. On a server-rendered
 * page React has not taken over yet, an attribute the server did not send
 * makes React log a hydration mismatch (issue #225: `data-a11y-scan` on the
 * docs menu). The page's scripts are held back here, the scan runs on the
 * server's HTML, and the scripts are let go as soon as anything in the menu
 * changes (or the scan is over, if nothing does), so a scan that marks the
 * menu hits React with the mark still on it.
 */
test("should leave a server-rendered element as the server sent it when a scan of it runs before React hydrates the page", async ({ page, isMobile }) => {
  test.skip(isMobile, "the docs menu is closed on a phone; the helper is the same");
  let release: () => void = () => undefined;
  const scriptsMayRun = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/_next/static/**/*.js", async (route) => {
    await scriptsMayRun;
    await route.continue().catch(() => undefined);
  });
  const changes: string[] = [];
  await page.exposeFunction("menuChanged", (change: string) => {
    changes.push(change);
    release();
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const menu = document.querySelector('nav[aria-label="Docs"]');
      if (!menu) return;
      const report: unknown = Reflect.get(window, "menuChanged");
      if (typeof report !== "function") return;
      const observer = new MutationObserver((records) => {
        for (const record of records) Reflect.apply(report, window, [`${record.type} ${record.attributeName ?? ""}`.trim()]);
      });
      observer.observe(menu, { attributes: true, childList: true, characterData: true, subtree: true });
    });
  });

  await page.goto("/docs", { waitUntil: "domcontentloaded" });
  const menu = page.getByRole("navigation", { name: "Docs" });
  await expect(menu).toBeVisible();
  const hydrated = () => menu.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactFiber")));
  expect(await hydrated(), "the page is still waiting for its scripts").toBe(false);

  await expectNoAxeViolations(menu).finally(release);
  expect(changes, "what the scan changed in the menu before React hydrated it").toEqual([]);
  await expect.poll(hydrated, { message: "React takes the page over" }).toBe(true);
});
