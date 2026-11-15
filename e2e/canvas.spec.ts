import type { Locator, Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";

/*
 * The canvas viewer, on the fixture page /dev/canvas (no database): a board
 * of frames on a desktop, panned by drag and zoomed from the toolbar or with
 * Ctrl + wheel, and the same frames stacked in the page column on a phone.
 * A plain wheel always scrolls the page.
 */

/*
 * The fixture page streams its content, and a stored theme can update the
 * page before that content hydrates. React then draws the content itself and
 * leaves the streamed copy in the document, hidden. So every locator starts
 * from the board a reader can see.
 */
const board = (page: Page) => page.locator("[data-canvas-board]:visible");
const frame = (page: Page, id: string) => board(page).locator(`[data-canvas-frame="${id}"]`);
const frameBody = (page: Page, id: string) => frame(page, id).locator("[data-canvas-frame-body]");

async function open(page: Page, fixture: string, mode: "board" | "stacked") {
  await page.goto(`/dev/canvas?fixture=${fixture}`);
  await expect(board(page)).toHaveAttribute("data-canvas-board", mode);
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("The element has no box.");
  return box;
}

/** How many columns the first Grid in a frame lays out. */
const gridColumns = (page: Page, id: string) => frame(page, id).locator("[data-slot=ui-grid]").first().evaluate((element) => {
  const tracks = getComputedStyle(element).gridTemplateColumns;
  return tracks === "none" ? 0 : tracks.split(" ").length;
});

const zoomOf = async (page: Page) => Number.parseInt((await board(page).getAttribute("data-canvas-zoom")) ?? "", 10);

test.describe("on a desktop", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "the board shows on wide columns; phones stack the frames");
  });

  test("should draw each frame at its own width and fit them all in the board when a canvas opens", async ({ page }) => {
    await open(page, "site", "board");
    for (const [id, name, width] of [["home-desktop", "Home, desktop", 1440], ["home-tablet", "Home, tablet", 768], ["home-phone", "Home, phone", 390]] as const) {
      await expect(page.getByRole("group", { name: `${name} ${String(width)}` })).toBeVisible();
      expect(await frameBody(page, id).evaluate((element: HTMLElement) => element.offsetWidth)).toBe(width);
    }
    expect(await zoomOf(page)).toBeLessThan(100);
    const pane = await boxOf(board(page));
    await expect(async () => {
      for (const id of ["home-desktop", "home-tablet", "home-phone"]) {
        const box = await boxOf(frameBody(page, id));
        expect(box.x).toBeGreaterThanOrEqual(pane.x);
        expect(box.y).toBeGreaterThanOrEqual(pane.y);
        expect(box.x + box.width).toBeLessThanOrEqual(pane.x + pane.width);
        expect(box.y + box.height).toBeLessThanOrEqual(pane.y + pane.height);
      }
    }).toPass({ timeout: 5_000 });
  });

  test("should zoom in steps, show 100%, and come back with Fit when a reader uses the toolbar", async ({ page }) => {
    await open(page, "flow", "board");
    const toolbar = page.getByRole("group", { name: "Canvas view" });
    const fitted = await zoomOf(page);
    expect(fitted).toBeLessThan(100);
    await toolbar.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(fitted);
    await toolbar.getByRole("button", { name: /Show at 100%/ }).click();
    await expect(board(page)).toHaveAttribute("data-canvas-zoom", "100%");
    await expect.poll(async () => Math.round((await boxOf(frameBody(page, "inbox"))).width)).toBe(390);
    await toolbar.getByRole("button", { name: "Zoom out" }).click();
    await expect(board(page)).toHaveAttribute("data-canvas-zoom", "75%");
    await toolbar.getByRole("button", { name: "Fit" }).click();
    await expect(board(page)).toHaveAttribute("data-canvas-zoom", `${String(fitted)}%`);
  });

  test("should not animate the board when the reader asked for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "flow", "board");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(() => board(page).locator("[data-canvas-world]").evaluate((element) => getComputedStyle(element).transitionProperty)).toBe("none");
  });

  test("should move the board when a reader drags it, and leave it when they use a control in a frame", async ({ page }) => {
    await open(page, "flow", "board");
    const pane = await boxOf(board(page));
    const before = await boxOf(frameBody(page, "inbox"));
    await page.mouse.move(pane.x + 12, pane.y + 12);
    await page.mouse.down();
    await page.mouse.move(pane.x + 72, pane.y + 42, { steps: 4 });
    await page.mouse.move(pane.x + 132, pane.y + 72, { steps: 4 });
    await page.mouse.up();
    const after = await boxOf(frameBody(page, "inbox"));
    expect(Math.round(after.x - before.x)).toBe(120);
    expect(Math.round(after.y - before.y)).toBe(60);

    // A drag that starts inside a frame, on its text, moves the board too.
    const title = frame(page, "inbox").getByRole("heading", { name: "Inbox" });
    const start = await boxOf(title);
    await page.mouse.move(start.x + 4, start.y + 4);
    await page.mouse.down();
    await page.mouse.move(start.x - 56, start.y + 4, { steps: 4 });
    await page.mouse.up();
    expect(Math.round((await boxOf(frameBody(page, "inbox"))).x - after.x)).toBe(-60);

    // A control inside a frame still works, and using it does not move the board.
    const moved = await boxOf(frameBody(page, "inbox"));
    await frame(page, "inbox").getByRole("tab", { name: "Done" }).click();
    await expect(frame(page, "inbox").getByText("Nothing closed today yet.")).toBeVisible();
    expect((await boxOf(frameBody(page, "inbox"))).x).toBe(moved.x);
  });

  test("should keep each frame's state apart when a reader changes an input in one", async ({ page }) => {
    await open(page, "flow", "board");
    await page.getByRole("button", { name: /Show at 100%/ }).click();
    await page.getByRole("button", { name: "Frames" }).click();
    await page.getByRole("menuitem", { name: /1\. Sign in/ }).click();
    const remember = frame(page, "sign-in").getByRole("checkbox", { name: "Keep me signed in" });
    await expect(remember).toBeChecked();
    await remember.click();
    await expect(remember).not.toBeChecked();
    await expect(frame(page, "settings").getByRole("switch", { name: "Push alerts" })).toBeChecked();
  });

  test("should zoom with Ctrl and the wheel, and leave a plain wheel to the page", async ({ page }) => {
    await open(page, "site", "board");
    const pane = await boxOf(board(page));
    const fitted = await zoomOf(page);
    await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
    await page.mouse.wheel(0, 240);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await zoomOf(page)).toBe(fitted);

    await page.evaluate(() => { window.scrollTo(0, 0); });
    await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -200);
    await page.keyboard.up("Control");
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(fitted);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("should go to a frame from the Frames menu and move focus to it", async ({ page }) => {
    await open(page, "site", "board");
    await page.getByRole("button", { name: "Frames" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText([/Home, desktop\s*1440/, /Home, tablet\s*768/, /Home, phone\s*390/]);
    await expectNoAxeViolations(menu);
    await expectNoAxeViolations(page.getByRole("group", { name: "Canvas view" }));
    await menu.getByRole("menuitem", { name: /Home, phone/ }).click();
    await expect(board(page)).toHaveAttribute("data-canvas-zoom", "100%");
    await expect(frame(page, "home-phone")).toBeFocused();
    const pane = await boxOf(board(page));
    await expect.poll(async () => Math.round((await boxOf(frameBody(page, "home-phone"))).y - pane.y)).toBe(69);
  });

  test("should bring a control into view, without scrolling the board's box, when focus moves to one outside it", async ({ page }) => {
    await open(page, "flow", "board");
    await page.getByRole("button", { name: /Show at 100%/ }).click();
    await page.getByRole("button", { name: "Frames" }).click();
    await page.getByRole("menuitem", { name: /1\. Sign in/ }).click();
    const pane = await boxOf(board(page));
    const alerts = frame(page, "settings").getByRole("switch", { name: "Push alerts" });
    // Wait for the glide to the first frame to end: it rests one frame-name row and the board's padding below the top edge.
    await expect.poll(async () => Math.round((await boxOf(frameBody(page, "sign-in"))).y - pane.y)).toBe(69);
    expect((await boxOf(alerts)).x).toBeGreaterThan(pane.x + pane.width);
    await alerts.focus();
    await expect.poll(async () => {
      const box = await boxOf(alerts);
      return box.x >= pane.x && box.x + box.width <= pane.x + pane.width;
    }).toBe(true);
    expect(await board(page).evaluate((element) => [element.scrollLeft, element.scrollTop])).toEqual([0, 0]);
  });

  test("should move and zoom from the keyboard when the board has focus", async ({ page }) => {
    await open(page, "flow", "board");
    const fitted = await zoomOf(page);
    const before = await boxOf(frameBody(page, "inbox"));
    await board(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => Math.round((await boxOf(frameBody(page, "inbox"))).x - before.x)).toBe(-80);
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => Math.round((await boxOf(frameBody(page, "inbox"))).y - before.y)).toBe(-80);
    await page.keyboard.press("+");
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(fitted);
    await page.keyboard.press("0");
    await expect(board(page)).toHaveAttribute("data-canvas-zoom", `${String(fitted)}%`);
    await expect.poll(async () => Math.round((await boxOf(frameBody(page, "inbox"))).x)).toBe(Math.round(before.x));
  });

  test("should keep frames where their author placed them when a canvas sets x and y", async ({ page }) => {
    await open(page, "placed", "board");
    const zoom = await board(page).locator("[data-canvas-world]").evaluate((element) => Number(getComputedStyle(element).getPropertyValue("--canvas-zoom")));
    const desktop = await boxOf(frameBody(page, "home-desktop"));
    const phone = await boxOf(frameBody(page, "home-phone"));
    const signIn = await boxOf(frameBody(page, "sign-in"));
    expect((phone.x - desktop.x) / zoom).toBeCloseTo(1520, -1);
    expect((signIn.y - desktop.y) / zoom).toBeCloseTo(1800, -1);
    expect(Math.round(signIn.x)).toBe(Math.round(desktop.x));
  });

  test("should lay out a grid for its frame's width, not the window's, when a narrow frame sits beside a wide one", async ({ page }) => {
    // Both frames hold the same page, whose first Grid asks for three columns. A Grid gets three from 608px of its interface's width.
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "placed", "board");
    await expect(frame(page, "home-phone").getByText("Drafts from your calendar")).toBeVisible();
    expect(await frameBody(page, "home-phone").evaluate((element: HTMLElement) => element.offsetWidth)).toBe(390);
    expect(await gridColumns(page, "home-phone")).toBe(1);
    expect(await frameBody(page, "home-desktop").evaluate((element: HTMLElement) => element.offsetWidth)).toBe(1440);
    expect(await gridColumns(page, "home-desktop")).toBe(3);
  });

  test("should draw a full board and say how long it took", async ({ page }) => {
    const started = Date.now();
    await open(page, "large", "board");
    await expect(board(page).locator("[data-canvas-frame]")).toHaveCount(24);
    await expect(frame(page, "page-24").getByRole("heading", { name: "Invoices that send themselves" })).toBeVisible();
    const elapsed = Date.now() - started;
    const nodes = await board(page).evaluate((element) => element.querySelectorAll("*").length);
    test.info().annotations.push({ type: "canvas timing", description: `24 frames, ${String(nodes)} DOM nodes: shown ${String(elapsed)} ms after navigation started (development build).` });
    expect(elapsed).toBeLessThan(30_000);
  });
});

test.describe("on a phone", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, "frames stack only in a narrow column");
  });

  test("should stack the frames in the page, each scaled to the column, when the column is narrow", async ({ page }) => {
    await open(page, "site", "stacked");
    await expect(page.getByRole("group", { name: "Canvas view" })).toHaveCount(0);
    const column = await boxOf(board(page));
    let bottom = column.y;
    for (const id of ["home-desktop", "home-tablet", "home-phone"]) {
      const box = await boxOf(frameBody(page, id));
      expect(box.x).toBeCloseTo(column.x, 0);
      expect(box.width).toBeLessThanOrEqual(column.width + 0.5);
      expect(box.y).toBeGreaterThanOrEqual(bottom);
      bottom = box.y + box.height;
    }
    expect((await boxOf(frameBody(page, "home-desktop"))).width).toBeCloseTo(column.width, 0);
    expect(await frameBody(page, "home-desktop").evaluate((element: HTMLElement) => element.offsetWidth)).toBe(1440);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // The page keeps exactly the room the scaled frames take: the text after the canvas starts below the last frame.
    const below = await boxOf(page.locator("[data-fixture-below]:visible"));
    expect(below.y).toBeGreaterThanOrEqual(bottom);
    expect(below.y - bottom).toBeLessThan(40);
  });

  test("should let a reader use a control in a stacked frame", async ({ page }) => {
    await open(page, "flow", "stacked");
    await frame(page, "inbox").getByRole("tab", { name: "Done" }).tap();
    await expect(frame(page, "inbox").getByText("Nothing closed today yet.")).toBeVisible();
  });
});

test("should show a notice in place of each frame that cannot be shown, and still draw the good one", async ({ page, isMobile }) => {
  await open(page, "broken", isMobile ? "stacked" : "board");
  await expect(frame(page, "good").getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const bad = frame(page, "frame-2");
  await expect(bad.getByText("This frame could not be shown.")).toBeVisible();
  await expect(bad.getByText(/"width" must be a whole number from 240 to 2560/)).toBeVisible();
  await expect(frame(page, "no-root").getByText("This interface could not be shown.")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("should say so when a canvas has no frames or cannot be read", async ({ page }) => {
  await page.goto("/dev/canvas?fixture=empty");
  await expect(page.getByText("This canvas has no frames yet.")).toBeVisible();
  await expect(board(page)).toHaveCount(0);
  await page.goto("/dev/canvas?fixture=unreadable");
  await expect(page.getByText("This canvas could not be shown.")).toBeVisible();
  await expect(page.getByText(/"frames" must be a list of frames/)).toBeVisible();
});

test("should open a canvas for an editor as its board, with the JSON one step away and checked as they type", async ({ page, isMobile }) => {
  await page.goto("/dev/editor?kind=canvas");
  await expect(board(page)).toHaveAttribute("data-canvas-board", isMobile ? "stacked" : "board");
  await expect(frame(page, "inbox").getByRole("heading", { name: "Inbox" })).toBeVisible();
  await page.getByRole("button", { name: "Edit source" }).click();
  const source = page.getByRole("textbox", { name: "Artifact source" });
  await expect(source).toHaveValue(/"id": "sign-in"/);
  await expect(page.getByRole("status").filter({ hasText: "Valid Canvas." })).toBeVisible();
  await source.fill('{ "version": 1, "frames": [{ "id": "home", "name": "Home", "width": 20, "spec": {} }] }');
  await expect(page.getByRole("status").filter({ hasText: 'Frame "home": "width" must be a whole number from 240 to 2560' })).toBeVisible();
});

for (const fixture of ["site", "flow"] as const) {
  test(`should pass the accessibility scan on the ${fixture} canvas`, async ({ page, isMobile }) => {
    await open(page, fixture, isMobile ? "stacked" : "board");
    await expect(board(page).locator("[data-canvas-frame]").first()).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`should pass color contrast on the canvases when the site is ${scheme}`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the same colors as the desktop run");
    await page.addInitScript((value) => {
      try { window.localStorage.setItem("theme", value); } catch { /* no storage in this frame */ }
    }, scheme);
    for (const fixture of ["site", "flow", "broken"]) {
      await open(page, fixture, "board");
      await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /(^|\s)dark(\s|$)/ : /^(?!.*(^|\s)dark(\s|$))/);
      await page.evaluate(() => document.fonts.ready);
      // Read at 100%, where every frame's text is at its real size.
      await page.getByRole("button", { name: /Show at 100%/ }).click();
      await expect(async () => { await expectNoAxeViolations(page, { only: ["color-contrast"] }); }).toPass({ timeout: 20_000 });
    }
  });
}
