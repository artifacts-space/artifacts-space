import type { Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { board, boxInBoard, boxOf, frame, frameBody, gridColumns, openCanvas as open, zoomOf } from "./support/canvas";
import { expect, test } from "./support/test";

/*
 * The canvas viewer, on the fixture page /dev/canvas (no database): a board
 * of frames on a desktop, panned by drag and zoomed from the toolbar or with
 * Ctrl + wheel, and the same frames stacked in the page column on a phone.
 * A plain wheel always scrolls the page.
 */


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
    await expect(menu.getByRole("menuitem")).toHaveText([/Home, desktop\s*1440/, /Home, tablet\s*768/, /Home, phone\s*390/, /Home, edge to edge\s*1440/]);
    await expectNoAxeViolations(menu);
    await expectNoAxeViolations(page.getByRole("group", { name: "Canvas view" }));
    await menu.getByRole("menuitem", { name: /Home, phone/ }).click();
    await expect(board(page)).toHaveAttribute("data-canvas-zoom", "100%");
    await expect(frame(page, "home-phone")).toBeFocused();
    const pane = await boxOf(board(page));
    await expect.poll(async () => Math.round((await boxOf(frameBody(page, "home-phone"))).y - pane.y)).toBe(69);
  });

  test("should fill the window when a reader presses Full screen, and come back to the page with the button or Escape", async ({ page }) => {
    await open(page, "site", "board");
    const fitted = await zoomOf(page);
    const enter = page.getByRole("group", { name: "Canvas view" }).getByRole("button", { name: "Full screen", exact: true });
    await enter.click();
    const screen = page.getByRole("dialog", { name: "Canvas, full screen" });
    const full = screen.locator("[data-canvas-board]");
    await expect(full).toHaveAttribute("data-canvas-board", "board");
    expect(await boxOf(full)).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
    await expect(full.locator("[data-canvas-frame]")).toHaveCount(4);
    // The same frames fit a larger window at a larger scale.
    await expect.poll(async () => Number.parseInt((await full.getAttribute("data-canvas-zoom")) ?? "", 10)).toBeGreaterThan(fitted);
    // The board has focus, so the arrow keys move it at once.
    await expect(full).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expectNoAxeViolations(screen);
    // Its menu opens over it.
    await screen.getByRole("button", { name: "Frames" }).click();
    await page.getByRole("menuitem", { name: /Home, phone/ }).click();
    await expect(full).toHaveAttribute("data-canvas-zoom", "100%");
    await expect(full.locator('[data-canvas-frame="home-phone"]')).toBeFocused();

    await screen.getByRole("button", { name: "Exit full screen" }).click();
    await expect(screen).toBeHidden();
    await expect(enter).toBeFocused();
    // The board in the page is as the reader left it.
    await expect(board(page)).toHaveAttribute("data-canvas-zoom", `${String(fitted)}%`);

    await enter.click();
    await expect(full).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(screen).toBeHidden();
    await expect(enter).toBeFocused();
  });

  test("should keep the artifact's theme on the full-screen board", async ({ page }) => {
    await page.goto("/dev/canvas?fixture=flow&theme=paper");
    await expect(board(page)).toHaveAttribute("data-canvas-board", "board");
    const tokensOf = (scope: string) => page.locator(scope).evaluate((element) => {
      const style = getComputedStyle(element);
      return ["--background", "--primary", "--theme-font-body"].map((name) => style.getPropertyValue(name).trim());
    });
    const inPage = await tokensOf("[data-fixture-theme=paper]");
    expect(inPage.every((value) => value !== "")).toBe(true);
    await page.getByRole("button", { name: "Full screen", exact: true }).click();
    const screen = page.getByRole("dialog", { name: "Canvas, full screen" });
    await expect(screen.locator("[data-canvas-board]")).toHaveAttribute("data-canvas-board", "board");
    expect(await tokensOf("[data-canvas-full-screen] .artifact-theme")).toEqual(inPage);
    // Read at 100%, where every frame's text is at its real size.
    await screen.getByRole("button", { name: /Show at 100%/ }).click();
    await expect(async () => { await expectNoAxeViolations(screen, { only: ["color-contrast"] }); }).toPass({ timeout: 20_000 });
  });

  test("should close full screen when the window becomes too narrow for a board", async ({ page }) => {
    await open(page, "flow", "board");
    await page.getByRole("button", { name: "Full screen", exact: true }).click();
    const screen = page.getByRole("dialog", { name: "Canvas, full screen" });
    await expect(screen.locator("[data-canvas-board]")).toHaveAttribute("data-canvas-board", "board");
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(screen).toBeHidden();
    await expect(board(page)).toHaveAttribute("data-canvas-board", "stacked");
    // The button that opened full screen is gone with the board's controls, so the canvas itself takes the focus: it never falls to the page.
    await expect(page.locator(":focus").locator("[data-canvas-page-board]")).toHaveCount(1);
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
    // Focus first scrolls the board's box, which brings the control into view at once; the box's scroll
    // handler then hands that scroll to the pan and sets the box back to 0, one event later. So wait for
    // the end state: the box at rest and the control still in view.
    await expect.poll(async () => board(page).evaluate((element) => [element.scrollLeft, element.scrollTop])).toEqual([0, 0]);
    await expect.poll(async () => {
      const box = await boxOf(alerts);
      return box.x >= pane.x && box.x + box.width <= pane.x + pane.width;
    }).toBe(true);
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

  test("should let a frame with no padding draw its surfaces to the frame's edges", async ({ page }) => {
    await open(page, "site", "board");
    const body = frameBody(page, "home-full-bleed");
    await expect(body.getByRole("heading", { name: "Get paid nine days sooner" })).toBeVisible();
    await expect(body.getByRole("img", { name: "The invoices dashboard" })).toBeVisible();
    // The hero's painted surface is the nearest ancestor of its heading with a background. It is as wide as the frame inside its border.
    const widths = await body.evaluate((element: HTMLElement) => {
      let painted = element.querySelector("h1")?.parentElement ?? null;
      while (painted && painted !== element && getComputedStyle(painted).backgroundColor === "rgba(0, 0, 0, 0)") painted = painted.parentElement;
      return { frame: element.clientWidth, hero: painted instanceof HTMLElement && painted !== element ? painted.offsetWidth : 0 };
    });
    expect(widths.frame).toBe(1438);
    expect(widths.hero).toBe(widths.frame);
    // A frame with the usual padding keeps its content inside it.
    expect(await frameBody(page, "home-desktop").evaluate((element: HTMLElement) => (element.firstElementChild instanceof HTMLElement ? element.firstElementChild.offsetWidth : 0))).toBe(1390);
  });

  for (const [name, lose] of [
    ["the pointer's capture is lost", (page: Page) => board(page).evaluate((element, id) => { element.releasePointerCapture(id); }, 1)],
    ["the window loses focus", (page: Page) => page.evaluate(() => { window.dispatchEvent(new Event("blur")); })],
  ] as const) {
    test(`should end a drag when ${name}, so the board stops following the pointer`, async ({ page }) => {
      await open(page, "flow", "board");
      const pane = await boxOf(board(page));
      const before = await boxInBoard(page, "inbox");
      await page.mouse.move(pane.x + 12, pane.y + 12);
      await page.mouse.down();
      await page.mouse.move(pane.x + 72, pane.y + 42, { steps: 4 });
      await expect(board(page)).toHaveClass(/cursor-grabbing/);
      expect(Math.round((await boxInBoard(page, "inbox")).x - before.x)).toBe(60);

      await lose(page);
      // The button is still down, but the drag is over: moving on does not move the board. (A browser reports a lost capture with the pointer's next event.)
      await page.mouse.move(pane.x + 192, pane.y + 102, { steps: 4 });
      await expect(board(page)).not.toHaveClass(/cursor-grabbing/);
      expect(Math.round((await boxInBoard(page, "inbox")).x - before.x)).toBe(60);
      await page.mouse.up();

      // The next press drags again.
      await page.mouse.move(pane.x + 12, pane.y + 12);
      await page.mouse.down();
      await page.mouse.move(pane.x + 42, pane.y + 12, { steps: 4 });
      await page.mouse.up();
      expect(Math.round((await boxInBoard(page, "inbox")).x - before.x)).toBe(90);
    });
  }

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
    for (const id of ["home-desktop", "home-tablet", "home-phone", "home-full-bleed"]) {
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

  test("should give each stacked frame its final height in the first paint, so nothing moves when scripts start", async ({ page }) => {
    // Before any page script: note every height each frame's place in the column ever has, from the server's markup on.
    await page.addInitScript(() => {
      const heights: Record<string, number[]> = {};
      Object.assign(window, { canvasFrameHeights: heights });
      const sizes = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const height = Math.round(entry.target.getBoundingClientRect().height);
          // A copy the page keeps hidden has no height and is not a frame anyone sees.
          if (height > 0) (heights[entry.target.getAttribute("data-canvas-frame") ?? ""] ??= []).push(height);
        }
      });
      const watched = new WeakSet<Element>();
      new MutationObserver(() => {
        for (const slot of document.querySelectorAll("[data-canvas-frame]")) {
          if (watched.has(slot)) continue;
          watched.add(slot);
          sizes.observe(slot);
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await open(page, "site", "stacked");
    await page.evaluate(() => document.fonts.ready);
    await expect(frame(page, "home-full-bleed").getByRole("heading", { name: "Get paid nine days sooner" })).toBeVisible();
    await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));

    const heights = await page.evaluate(() => (window as unknown as { canvasFrameHeights: Record<string, number[]> }).canvasFrameHeights);
    expect(Object.keys(heights).sort()).toEqual(["home-desktop", "home-full-bleed", "home-phone", "home-tablet"]);
    for (const [id, seen] of Object.entries(heights)) {
      expect(Math.max(...seen) - Math.min(...seen), `${id} kept one height: ${seen.join(", ")}`).toBeLessThanOrEqual(1);
    }
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
