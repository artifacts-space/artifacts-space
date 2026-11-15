import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";
import { board, openCanvas } from "./support/canvas";
import { readColors } from "./support/colors";

/*
 * Props added to the pieces a screen is drawn with: how a row looks once it
 * has stacked, a line that is spoken when it appears, one button that opens
 * and closes, the danger Button, check marks in a Table, the plain Metric,
 * the vertical Separator, the full-width Select, and the Placeholder
 * frames. Each is scanned with axe in every state it has, and what the
 * accessibility tree says is read where that is the point.
 */

const specimen = (page: Page, group: string, name: string) => page.locator(`section#${group} [data-specimen="${name}"]`);

/** The gallery is ready once React has hydrated it, which its ready mark says. */
async function galleryReady(page: Page, group = "Box") {
  await page.goto(`/dev/components#${group}`);
  await expect(page.locator("[data-gallery-ready]")).toBeAttached({ timeout: 60_000 });
}

const boxOf = (target: Locator) => target.evaluate((element) => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
});

const computed = (target: Locator, property: string) => target.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

/** A phone-sized frame in a desktop window; on a phone the specimen is already that narrow. */
async function narrow(frame: Locator, isMobile: boolean) {
  if (!isMobile) await frame.evaluate((element) => { element.style.width = "390px"; });
}

test("should pass axe on the Separator, Table, Metric, Text, and Callout groups of the gallery", async ({ page }) => {
  await galleryReady(page, "Separator");
  for (const group of ["Separator", "Table", "Metric", "Text", "Callout"]) {
    const section = page.locator(`section#${group}`);
    await section.scrollIntoViewIfNeeded();
    await expectNoAxeViolations(section);
  }
});

test("should let stacked children fill the width with alignBelow, and leave a row without it as it was", async ({ page, isMobile }) => {
  await galleryReady(page);
  const filled = specimen(page, "Box", "Stacked, children fill the width");
  const kept = specimen(page, "Box", "Stacked, children keep their width");
  const panel = (frame: Locator) => frame.getByRole("group", { name: "Product shot" });
  const row = (frame: Locator) => panel(frame).locator("xpath=..");
  if (!isMobile) {
    // A wide page column: both are rows, centered across.
    for (const frame of [filled, kept]) {
      expect(await computed(row(frame), "flex-direction")).toBe("row");
      expect(await computed(row(frame), "align-items")).toBe("center");
    }
  }
  for (const frame of [filled, kept]) await narrow(frame, isMobile);
  await expect.poll(() => computed(row(filled), "flex-direction")).toBe("column");
  expect(await computed(row(filled), "align-items")).toBe("stretch");
  expect((await boxOf(panel(filled))).width).toBeGreaterThan((await boxOf(row(filled))).width - 2);
  // The row that sets no alignBelow keeps its centering once stacked: its panel is only as wide as its padding.
  await expect.poll(() => computed(row(kept), "flex-direction")).toBe("column");
  expect(await computed(row(kept), "align-items")).toBe("center");
  expect((await boxOf(panel(kept))).width).toBeLessThan((await boxOf(row(kept))).width / 2);
});

test("should draw a stacked row last child first with reverseBelow, and keep the order of the source for the keyboard and screen readers", async ({ page, isMobile }) => {
  await galleryReady(page);
  const frame = specimen(page, "Box", "Stacked, drawn in reverse");
  const picture = frame.getByRole("img", { name: "Picture first in the row" });
  const words = frame.getByText("Words above the picture once the row has stacked.");
  const row = words.locator("xpath=..");
  if (!isMobile) {
    // In a row the picture comes first, as written.
    expect((await boxOf(picture)).x).toBeLessThan((await boxOf(words)).x);
  }
  await narrow(frame, isMobile);
  await expect.poll(async () => (await boxOf(words)).y < (await boxOf(picture)).y).toBe(true);
  expect((await boxOf(picture)).width).toBeGreaterThan((await boxOf(row)).width - 2);
  // The source order is unchanged: the picture is still the row's first child, and is read first.
  expect(await row.evaluate((element) => Array.from(element.children, (child) => (child.tagName === "P" ? "words" : "picture")))).toEqual(["picture", "words"]);
  await expect(row).toMatchAriaSnapshot(`
    - img "Picture first in the row"
    - paragraph: Words above the picture once the row has stacked.
  `);
});

test("should speak a line that appears after a button press through the interface's one live region", async ({ page }) => {
  await galleryReady(page, "specs");
  const waitlist = specimen(page, "specs", "Announced line and a toggle");
  await waitlist.scrollIntoViewIfNeeded();
  const status = waitlist.getByRole("status");
  // One region, there from the start and silent.
  await expect(status).toHaveCount(1);
  await expect(status).toHaveText("");
  await expect(waitlist.getByText("Thanks. You are on the list.")).toHaveCount(0);
  await expectNoAxeViolations(waitlist);

  await waitlist.getByRole("button", { name: "Join the list" }).click();
  await expect(status).toHaveText("Thanks. You are on the list.");
  await expect(waitlist).toMatchAriaSnapshot(`
    - group "Waitlist":
      - heading "Join the waitlist" [level=3]
      - button "Join the list"
      - paragraph: Thanks. You are on the list.
      - button "Details"
    - status: Thanks. You are on the list.
  `);
  // The line itself carries no live role: the region speaks for it.
  await expect(waitlist.locator("p", { hasText: "Thanks. You are on the list." })).not.toHaveAttribute("role");
  await expectNoAxeViolations(waitlist);

  // Another interface on the page has its own region and stays silent.
  const other = specimen(page, "specs", "Sign-in screen").getByRole("status");
  await expect(other).toHaveCount(1);
  await expect(other).toHaveText("");
  // Text that was there when its interface was first drawn is never spoken.
  await expect(specimen(page, "Text", "Announced").getByRole("status")).toHaveText("");
  await expect(specimen(page, "Callout", "Announced").getByRole("status")).toHaveText("");

  // The spoken line leaves the region after a while, so it is not found later as stray text.
  await expect(status).toHaveText("", { timeout: 15_000 });
  await expect(waitlist.getByText("Thanks. You are on the list.")).toBeVisible();
});

test("should give each frame of a canvas a live region of its own, so one frame never speaks for another", async ({ page, isMobile }) => {
  await openCanvas(page, "site", isMobile ? "stacked" : "board");
  const frames = board(page).locator("[data-canvas-frame]");
  expect(await frames.count()).toBeGreaterThanOrEqual(2);
  for (const frame of await frames.all()) {
    const region = frame.getByRole("status");
    await expect(region).toHaveCount(1);
    await expect(region).toHaveText("");
  }
});

test("should open and close a note with one button that runs toggleState, and speak the note each time it opens", async ({ page }) => {
  await galleryReady(page, "specs");
  const waitlist = specimen(page, "specs", "Announced line and a toggle");
  await waitlist.scrollIntoViewIfNeeded();
  const status = waitlist.getByRole("status");
  const note = waitlist.getByRole("note");
  const details = waitlist.getByRole("button", { name: "Details" });
  await expect(note).toHaveCount(0);
  // The button says whether the note is open, from the same state it flips.
  await expect(details).toHaveAttribute("aria-expanded", "false");

  await details.click();
  await expect(note).toBeVisible();
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await expect(status).toHaveText("One email. We write once, when your place is ready.");
  await expectNoAxeViolations(waitlist);
  const spoken = await status.locator("span").elementHandle();

  await details.click();
  await expect(note).toHaveCount(0);
  await expect(details).toHaveAttribute("aria-expanded", "false");

  await details.click();
  await expect(note).toBeVisible();
  await expect(status).toHaveText("One email. We write once, when your place is ready.");
  // The same words are a new node in the region, so a screen reader speaks them again.
  expect(await status.locator("span").evaluate((element, earlier) => element !== earlier, spoken)).toBe(true);
});

/** The danger Button of one surface box: its label reads at rest, and reads at least as well under the pointer. */
async function expectDangerReads(page: Page, box: Locator, fillMoves: boolean) {
  const name = (await box.getAttribute("aria-label")) ?? "";
  const button = box.getByRole("button", { name: "Delete" });
  await button.scrollIntoViewIfNeeded();
  const rest = await readColors(button);
  expect(rest.contrast, `${name}: label ${rest.text} on ${rest.background}`).toBeGreaterThanOrEqual(4.5);
  await button.hover();
  // The fill moves away from the label under the pointer; wait for it to settle, then the label must still read.
  if (fillMoves) await expect.poll(async () => (await readColors(button)).background, { message: `${name}: the fill under the pointer` }).not.toBe(rest.background);
  await expect.poll(async () => (await readColors(button)).contrast, { message: `${name}: under the pointer` }).toBeGreaterThanOrEqual(rest.contrast);
  await page.mouse.move(0, 0);
}

for (const scheme of ["light", "dark"] as const) {
  test(`should hold a danger Button's label at 4.5:1 on every surface, at rest and under the pointer, when the site is ${scheme}`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the same colors as the desktop run");
    await page.addInitScript((value) => {
      try { window.localStorage.setItem("theme", value); } catch { /* no storage in this frame */ }
    }, scheme);
    await galleryReady(page, "specs");
    // On the site palette, and under a theme whose accent is of the other mode on each side.
    const matrices = [
      { theme: "site", matrix: specimen(page, "specs", "Surfaces and tones") },
      { theme: "ocean", matrix: page.locator('[data-themed-surfaces="ocean"]') },
    ];
    for (const { theme, matrix } of matrices) {
      const boxes = await matrix.getByRole("group", { name: /^Surface / }).all();
      expect(boxes).toHaveLength(15);
      for (const box of boxes) {
        // Where the theme's danger tone cannot hold on its primary surface, the button takes the text color of that
        // surface as its fill. That fill is already as far from the label as it goes, so it stays put under the pointer.
        const fallback = scheme === "light" && theme === "ocean" && (await box.getAttribute("aria-label")) === "Surface primary";
        await expectDangerReads(page, box, !fallback);
      }
    }
  });
}

test("should draw the danger Button variants in the gallery with a name, and leave a disabled one out of reach", async ({ page }) => {
  await galleryReady(page, "Button");
  const danger = specimen(page, "Button", "Danger").getByRole("button", { name: "Delete project" });
  await danger.scrollIntoViewIfNeeded();
  await expect(danger).toBeEnabled();
  expect((await readColors(danger)).contrast).toBeGreaterThanOrEqual(4.5);
  await expect(specimen(page, "Button", "Danger with an icon").getByRole("button", { name: "Remove member" })).toBeVisible();
  await expect(specimen(page, "Button", "Danger, disabled").getByRole("button", { name: "Delete account" })).toBeDisabled();
});

test("should read a check column as Yes and No, and show the marks to sighted readers", async ({ page }) => {
  await galleryReady(page, "Table");
  const table = specimen(page, "Table", "Check marks").getByRole("table");
  await table.scrollIntoViewIfNeeded();
  await expect(table).toMatchAriaSnapshot(`
    - table:
      - rowgroup:
        - row "Feature Free Team Seats":
          - columnheader "Feature"
          - columnheader "Free"
          - columnheader "Team"
          - columnheader "Seats"
      - rowgroup:
        - row "Unlimited artifacts Yes Yes Up to 3":
          - cell "Unlimited artifacts"
          - cell "Yes"
          - cell "Yes"
          - cell "Up to 3"
        - row "Team themes No Yes 25":
          - cell "Team themes"
          - cell "No"
          - cell "Yes"
          - cell "25"
        - row "Audit log No Yes —":
          - cell "Audit log"
          - cell "No"
          - cell "Yes"
          - cell "—"
        - row "Words stay words Yes No —":
          - cell "Words stay words"
          - cell "Yes"
          - cell "No"
          - cell "—"
  `);
  await expect(table.locator("svg[data-check=yes]")).toHaveCount(4);
  await expect(table.locator("svg[data-check=no]")).toHaveCount(2);
  // A mark sits in the middle of its column; a column that asks for the right keeps it.
  const firstRow = table.locator("tbody tr").first();
  expect(await computed(firstRow.locator("td").nth(1), "text-align")).toBe("center");
  expect(await computed(firstRow.locator("td").nth(3), "text-align")).toBe("right");
});

test("should draw a plain Metric without a card around it", async ({ page }) => {
  await galleryReady(page, "Metric");
  const plain = specimen(page, "Metric", "Plain").getByText("Teams onboarded").locator("xpath=..");
  const card = specimen(page, "Metric", "Currency").getByText("Revenue").locator("xpath=..");
  await plain.scrollIntoViewIfNeeded();
  expect(await computed(plain, "box-shadow")).toBe("none");
  expect(await computed(plain, "padding-top")).toBe("0px");
  expect(await computed(card, "box-shadow")).not.toBe("none");
  expect(await computed(card, "padding-top")).toBe("16px");
  // The number, the label, and the change are the same pieces.
  await expect(plain.getByText("1.2K")).toBeVisible();
  await expect(plain.getByText("this quarter")).toBeVisible();
});

test("should draw a vertical Separator as a line as tall as its row, named as a separator, and lay it flat once the row has stacked", async ({ page, isMobile }) => {
  await galleryReady(page);
  const row = specimen(page, "Box", "Row with vertical rules");
  await row.scrollIntoViewIfNeeded();
  const rules = row.getByRole("separator");
  await expect(rules).toHaveCount(2);
  await expect(rules.first()).toHaveAttribute("aria-orientation", "vertical");
  const rule = await boxOf(rules.first());
  const words = await boxOf(row.getByText("Docs"));
  expect(rule.width).toBe(1);
  expect(rule.height).toBeGreaterThanOrEqual(words.height - 1);
  await expect(row).toMatchAriaSnapshot(`
    - paragraph: Docs
    - separator
    - paragraph: Pricing
    - separator
    - paragraph: Changelog
  `);

  // Once a row has stacked, the line lies flat between the same two items, so the stack keeps one gap on each side of a line.
  const stacking = specimen(page, "Box", "Vertical rules in a row that stacks");
  await narrow(stacking, isMobile);
  const flat = stacking.getByRole("separator");
  const column = flat.locator("xpath=..");
  await expect.poll(() => computed(column, "flex-direction")).toBe("column");
  const line = await boxOf(flat);
  expect(line.height).toBe(1);
  expect(line.width).toBeGreaterThan((await boxOf(column)).width - 2);
  const [above, below] = [await boxOf(stacking.getByText("Monthly")), await boxOf(stacking.getByText("Yearly"))];
  expect(line.y).toBeGreaterThan(above.y + above.height);
  expect(line.y).toBeLessThan(below.y);
});

test("should let a Select fill its container with fullWidth, and keep the others at their cap", async ({ page, isMobile }) => {
  await galleryReady(page, "Select");
  const full = specimen(page, "Select", "Full width");
  await full.scrollIntoViewIfNeeded();
  const trigger = full.getByRole("combobox", { name: "Country" });
  const field = trigger.locator("xpath=..");
  expect((await boxOf(trigger)).width).toBeGreaterThan((await boxOf(field)).width - 2);
  const capped = await boxOf(specimen(page, "Select", "Normal").getByRole("combobox", { name: "Environment" }));
  expect(capped.width).toBeLessThanOrEqual(384);
  if (!isMobile) expect((await boxOf(trigger)).width).toBeGreaterThan(384);
  await trigger.click();
  await expect(page.getByRole("option", { name: "Mexico" })).toBeVisible();
  await expectNoAxeViolations(page.getByRole("listbox"));
  await page.keyboard.press("Escape");
});

test("should draw a browser and a phone around a Placeholder as decoration, with one named image in each", async ({ page }) => {
  await galleryReady(page, "Placeholder");
  const browser = specimen(page, "Placeholder", "Browser frame");
  const phone = specimen(page, "Placeholder", "Phone frame");
  await browser.scrollIntoViewIfNeeded();
  await expect(browser).toMatchAriaSnapshot(`- img "Dashboard"`);
  await expect(phone).toMatchAriaSnapshot(`- img "Home screen"`);
  // Nothing in a frame can be pressed or tabbed to.
  for (const frame of [browser, phone]) await expect(frame.locator("button, a, input, [tabindex]")).toHaveCount(0);
  expect((await boxOf(phone.locator("[data-frame=phone]"))).width).toBeLessThanOrEqual(256);
  const window = await boxOf(browser.locator("[data-frame=browser]"));
  const shot = await boxOf(browser.getByRole("img", { name: "Dashboard" }));
  expect(shot.width).toBeGreaterThan(window.width - 4);
  expect(shot.y).toBeGreaterThan(window.y + 16);
});

for (const slug of ["separator", "table", "metric", "button", "select", "text", "callout"]) {
  test(`should pass axe on the ${slug} docs page, with its live examples drawn`, async ({ page }) => {
    await page.goto(`/docs/json-render/components/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(`^${slug}$`, "i"));
    await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
    await expect(page.getByText("could not be shown")).toHaveCount(0);
    // The props table scrolls sideways on a phone and becomes a tab stop once it has measured itself, which needs the page interactive.
    await expect(async () => {
      await expectNoAxeViolations(page, {
        skip: {
          "scrollable-region-focusable": {
            on: "details:not([open]) pre",
            reason: "the JSON under a closed Show JSON toggle is not drawn until it opens, so it cannot measure itself yet; every component page has it",
          },
        },
      });
    }).toPass({ timeout: 20_000 });
  });
}
