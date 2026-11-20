import type { Locator, Page } from "@playwright/test";

import { expect } from "./test";

/* Helpers the canvas specs share: the board a reader can see, its frames, and a touch screen. */

/*
 * The fixture page streams its content, and a stored theme can update the
 * page before that content hydrates. React then draws the content itself and
 * leaves the streamed copy in the document, hidden. So every locator starts
 * from the board a reader can see.
 */
/** The board's window, as a reader sees it. */
export const board = (page: Page) => page.locator("[data-canvas-board]:visible");
/** One frame on the board, by its id. */
export const frame = (page: Page, id: string) => board(page).locator(`[data-canvas-frame="${id}"]`);
/** The part of a frame that draws its spec. */
export const frameBody = (page: Page, id: string) => frame(page, id).locator("[data-canvas-frame-body]");

/** Opens a canvas fixture and waits for the board to be in `mode`. */
export async function openCanvas(page: Page, fixture: string, mode: "board" | "stacked") {
  await page.goto(`/dev/canvas?fixture=${fixture}`);
  await expect(board(page)).toHaveAttribute("data-canvas-board", mode);
}

/** An element's box on the page; it must have one. */
export async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("The element has no box.");
  return box;
}

/** Waits until the board's world has stopped gliding and that has been drawn (two frames on). */
export const boardAtRest = (page: Page) => board(page).locator("[data-canvas-world]").evaluate(async (element) => {
  await Promise.allSettled(element.getAnimations({ subtree: false }).map((animation) => animation.finished));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

/**
 * The end state of a focus scroll, read together: the board turned the scroll into a pan (its box is back at 0), and
 * `control` is inside the board, whose box on the page is `pane`. Right after the focus the box is still scrolled,
 * which alone would put the control in view, so neither half says enough without the other.
 */
export async function pannedIntoView(page: Page, control: Locator, pane: { x: number; width: number }): Promise<boolean> {
  const [scroll, box] = await Promise.all([board(page).evaluate((element) => [element.scrollLeft, element.scrollTop]), boxOf(control)]);
  return scroll[0] === 0 && scroll[1] === 0 && box.x >= pane.x && box.x + box.width <= pane.x + pane.width;
}

/** How many columns the first Grid in a frame lays out. */
export const gridColumns = (page: Page, id: string) => frame(page, id).locator("[data-slot=ui-grid]").first().evaluate((element) => {
  const tracks = getComputedStyle(element).gridTemplateColumns;
  return tracks === "none" ? 0 : tracks.split(" ").length;
});

/** Sends touches to the page as a touch screen would: each call says where every finger is now. */
export async function touchScreen(page: Page) {
  const client = await page.context().newCDPSession(page);
  return (type: "touchStart" | "touchMove" | "touchEnd", fingers: readonly { x: number; y: number }[]) =>
    client.send("Input.dispatchTouchEvent", { type, touchPoints: fingers.map((finger, id) => ({ x: Math.round(finger.x), y: Math.round(finger.y), id })) });
}

/**
 * A frame body's box, measured from the board window's corner, so a page scroll does not change it. Both boxes are
 * read in the page at one moment: read one after the other from here, a page that is still scrolling (after a
 * swipe) moves between the two reads, and the frame seems to have moved in the board.
 */
export const boxInBoard = (page: Page, id: string) => frameBody(page, id).evaluate((body) => {
  const pane = body.closest("[data-canvas-board]");
  if (!pane) throw new Error("The frame is not on a board.");
  const [window, box] = [pane.getBoundingClientRect(), body.getBoundingClientRect()];
  return { x: box.x - window.x, y: box.y - window.y, width: box.width, height: box.height };
});

/** How much of the frames is inside the board's window, in pixels across and down. Nothing or less means the window is empty. */
export const framesInWindow = (page: Page) => board(page).evaluate((pane) => {
  const window = pane.getBoundingClientRect();
  const frames = [...pane.querySelectorAll("[data-canvas-frame]")].map((element) => element.getBoundingClientRect());
  const across = Math.min(window.right, Math.max(...frames.map((box) => box.right))) - Math.max(window.left, Math.min(...frames.map((box) => box.left)));
  const down = Math.min(window.bottom, Math.max(...frames.map((box) => box.bottom))) - Math.max(window.top, Math.min(...frames.map((box) => box.top)));
  return { across: Math.round(across), down: Math.round(down) };
});

/** The board's zoom as a whole percent. */
export const zoomOf = async (page: Page) => Number.parseInt((await board(page).getAttribute("data-canvas-zoom")) ?? "", 10);
