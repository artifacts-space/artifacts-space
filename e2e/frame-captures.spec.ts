import type { Page } from "@playwright/test";

import { captureGeometry, partBox } from "../src/lib/canvas/capture-rules";

import { expectNoAxeViolations } from "./support/a11y";
import { boxOf, frameBody } from "./support/canvas";
import { expect, test } from "./support/test";

/*
 * Frame captures in the browser: the capture host draws a canvas's frames
 * out of sight and uploads them in parts. The /dev/canvas fixture mounts the
 * host with a stand-in API (`?capture=1`) that keeps every upload in
 * `window.fixtureCaptures`, so these checks read the uploaded pixels.
 */

/** One uploaded part, as the pixels say. */
interface PartRead {
  type: string;
  width: number;
  height: number;
  /** How many different colors a sample of the pixels holds. */
  colors: number;
  /** The mean brightness of the sample, 0 to 255. */
  brightness: number;
  /** A sum over the sample, so two different pictures give two numbers. */
  sum: number;
}

interface CaptureRead {
  frameHash: string;
  mode: "light" | "dark";
  frames: string[];
  width: number;
  height: number;
  partial: boolean;
  contentType: string;
  current: boolean;
  parts: PartRead[];
}

const host = (page: Page) => page.locator("[data-frame-captures]");

/** Waits until the host has ended `passes` passes and is idle. */
async function passesEnded(page: Page, passes: number) {
  await expect(host(page)).toHaveAttribute("data-frame-capture-passes", String(passes), { timeout: 60_000 });
  await expect(host(page)).toHaveAttribute("data-frame-captures", "idle");
}

/** Opens a canvas fixture with a capture host and waits for its first pass to end. */
async function openWithCaptures(page: Page, fixture: string) {
  await page.goto(`/dev/canvas?fixture=${fixture}&capture=1`);
  await passesEnded(page, 1);
}

/** Tells the host its window lost focus, as when the person turns to another window after a save. */
const loseFocus = (page: Page) => page.evaluate(() => { window.dispatchEvent(new Event("blur")); });

/** What the host uploaded, with each part decoded in the page and read pixel by pixel. */
async function uploaded(page: Page): Promise<{ captures: CaptureRead[]; neededCalls: number }> {
  return page.evaluate(async () => {
    const seen = window.fixtureCaptures;
    if (!seen) throw new Error("The fixture has no capture store.");
    const readPart = async (url: string) => {
      const blob = await (await fetch(url)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No canvas.");
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const colors = new Set<number>();
      let brightness = 0;
      let sum = 0;
      let count = 0;
      // Every 53rd pixel: enough to tell a blank picture, a dark one, and two different ones apart.
      for (let index = 0; index < pixels.length; index += 4 * 53) {
        const red = pixels[index] ?? 0;
        const green = pixels[index + 1] ?? 0;
        const blue = pixels[index + 2] ?? 0;
        colors.add(red * 65_536 + green * 256 + blue);
        brightness += (red + green + blue) / 3;
        sum = (sum + (red * 3 + green * 5 + blue * 7) * ((count % 97) + 1)) % 1_000_000_007;
        count += 1;
      }
      return { type: blob.type, width: bitmap.width, height: bitmap.height, colors: colors.size, brightness: brightness / Math.max(1, count), sum };
    };
    const captures = [];
    for (const capture of seen.captures) {
      captures.push({ ...capture, parts: await Promise.all(capture.parts.map(readPart)) });
    }
    return { captures, neededCalls: seen.neededCalls };
  });
}

/** Checks one capture: finished, in parts of exactly the size the server's geometry gives, and none blank. */
function expectDrawn(capture: CaptureRead) {
  const geometry = captureGeometry(capture.width, capture.height);
  expect(capture.current, `${capture.frames.join()} ${capture.mode} is finished`).toBe(true);
  expect(capture.parts).toHaveLength(geometry.partCount);
  capture.parts.forEach((part, index) => {
    const box = partBox(geometry, capture.width, index + 1);
    const name = `${capture.frames.join()} ${capture.mode} part ${String(index + 1)}`;
    expect({ width: part.width, height: part.height }, `${name} has its box's size`).toEqual({ width: box?.width, height: box?.height });
    expect(part.type, name).toBe(capture.contentType);
    expect(part.colors, `${name} is not blank`).toBeGreaterThan(1);
  });
}

/** Checks that a frame's light image is light and its dark image dark, part by part, whatever mode the page around the host is in. */
function expectModes(captures: readonly CaptureRead[], frame: string) {
  const of = (mode: "light" | "dark") => captures.filter((capture) => capture.frames.includes(frame) && capture.mode === mode).at(-1);
  const light = of("light");
  const dark = of("dark");
  expect(light?.parts.length, `${frame} has both images`).toBe(dark?.parts.length);
  light?.parts.forEach((part, index) => {
    const other = dark?.parts[index];
    // Well apart, not a fixed distance: a frame with an inverse surface holds a dark band in light and a light one in dark.
    expect(part.brightness - (other?.brightness ?? 255), `${frame} part ${String(index + 1)} is lighter in light than in dark`).toBeGreaterThan(20);
  });
}

test.describe("frame captures", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "the host draws only in a window at least 640 pixels wide");
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`should draw every frame in light and in dark, in parts of exactly their size, on a ${scheme} page`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openWithCaptures(page, "site");
      const { captures, neededCalls } = await uploaded(page);
      // Four frames, each in two modes: one batch, then one more question that is answered with nothing.
      expect(captures.map((capture) => `${capture.frames.join()}:${capture.mode}`).sort()).toEqual(
        ["home-desktop", "home-tablet", "home-phone", "home-full-bleed"].flatMap((frame) => [`${frame}:dark`, `${frame}:light`]).sort(),
      );
      expect(neededCalls).toBe(2);
      for (const capture of captures) {
        expectDrawn(capture);
        expect(capture.partial).toBe(false);
        expect(capture.contentType).toBe("image/webp");
      }
      for (const frame of ["home-desktop", "home-tablet", "home-phone", "home-full-bleed"]) expectModes(captures, frame);
      // A frame with padding shows the page color around its content: nearly white in light, nearly black in dark.
      const phone = (mode: "light" | "dark") => captures.find((capture) => capture.frames.includes("home-phone") && capture.mode === mode)?.parts[0]?.brightness ?? -1;
      expect(phone("light")).toBeGreaterThan(200);
      expect(phone("dark")).toBeLessThan(60);
      // Each drawing is laid out at its frame's own width: it is as tall as the frame on the board.
      for (const frame of ["home-desktop", "home-tablet", "home-phone"]) {
        const onBoard = await frameBody(page, frame).evaluate((element) => element.scrollHeight);
        const drawn = captures.find((capture) => capture.frames.includes(frame) && capture.mode === "light");
        expect(Math.abs((drawn?.height ?? 0) - onBoard), `${frame} is drawn at the height it has on the board`).toBeLessThanOrEqual(onBoard * 0.05);
      }
    });
  }

  test("should upload nothing on a second pass when nothing changed", async ({ page }) => {
    await openWithCaptures(page, "site");
    const before = await uploaded(page);
    await page.getByRole("button", { name: "Save again" }).click();
    await loseFocus(page);
    await passesEnded(page, 2);
    const after = await uploaded(page);
    expect(after.captures).toHaveLength(before.captures.length);
    expect(after.neededCalls).toBe(before.neededCalls + 1);
  });

  test("should draw a changed frame again, and give it a changed image", async ({ page }) => {
    await openWithCaptures(page, "site");
    const before = await uploaded(page);
    await page.getByRole("button", { name: "Change the first frame" }).click();
    await loseFocus(page);
    await passesEnded(page, 2);
    const after = await uploaded(page);
    // Only the changed frame is drawn again, in both modes.
    const added = after.captures.slice(before.captures.length);
    expect(added.map((capture) => `${capture.frames.join()}:${capture.mode}`).sort()).toEqual(["home-desktop:dark", "home-desktop:light"]);
    for (const capture of added) {
      expectDrawn(capture);
      const earlier = before.captures.find((candidate) => candidate.frames.includes("home-desktop") && candidate.mode === capture.mode);
      expect(capture.frameHash).not.toBe(earlier?.frameHash);
      expect(capture.parts[0]?.sum, `the ${capture.mode} image changed`).not.toBe(earlier?.parts[0]?.sum);
    }
  });

  test("should draw a frame's pictures, and mark the capture partial when one cannot be fetched", async ({ page }) => {
    await openWithCaptures(page, "pictures");
    const whole = await uploaded(page);
    expect(whole.captures).toHaveLength(2);
    for (const capture of whole.captures) {
      expectDrawn(capture);
      expect(capture.partial).toBe(false);
    }
    expectModes(whole.captures, "team-tablet");
    // The second picture arrives empty, as a file that is gone would. No request fails, so the page logs nothing.
    await page.route(/artifacts-space-icon\.png\?file=2222/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: "" }));
    await openWithCaptures(page, "pictures");
    const partial = await uploaded(page);
    expect(partial.captures).toHaveLength(2);
    for (const capture of partial.captures) {
      expectDrawn(capture);
      expect(capture.partial).toBe(true);
    }
    // The picture that did arrive is in the image: the whole drawing holds more colors than the one that lost a picture.
    const colors = (captures: CaptureRead[]) => captures.find((capture) => capture.mode === "light")?.parts.reduce((total, part) => total + part.colors, 0) ?? 0;
    expect(colors(whole.captures)).toBeGreaterThan(colors(partial.captures));
  });

  test("should keep the box out of sight, out of the accessibility tree, and out of the page's scroll size", async ({ page }) => {
    // Notes every capture box the moment it is drawn: whether it sits in an inert container, and how wide and tall the page then scrolls.
    await page.addInitScript(() => {
      const notes: { inert: boolean; scrollWidth: number; scrollHeight: number }[] = [];
      Object.assign(window, { captureBoxNotes: notes });
      const before = { width: 0, height: 0 };
      new MutationObserver(() => {
        const box = document.querySelector("[data-capture-box]");
        const root = document.documentElement;
        if (!box) {
          before.width = root.scrollWidth;
          before.height = root.scrollHeight;
          return;
        }
        notes.push({ inert: box.closest("[inert]") !== null, scrollWidth: root.scrollWidth - before.width, scrollHeight: root.scrollHeight - before.height });
      }).observe(document, { subtree: true, childList: true });
    });
    await openWithCaptures(page, "site");
    const notes = await page.evaluate(() => (window as unknown as { captureBoxNotes: { inert: boolean; scrollWidth: number; scrollHeight: number }[] }).captureBoxNotes);
    expect(notes.length).toBeGreaterThanOrEqual(8);
    for (const note of notes) expect(note).toEqual({ inert: true, scrollWidth: 0, scrollHeight: 0 });
    // Nothing of the box is left, the host has no size, and each frame is on the page once.
    await expect(page.locator("[data-capture-box]")).toHaveCount(0);
    expect(await boxOf(host(page))).toMatchObject({ width: 0, height: 0 });
    await expect(page.getByRole("button", { name: "Watch the demo" })).toHaveCount(4);
    await expectNoAxeViolations(page);
  });

  test("should have no host on a fixture that did not ask for one", async ({ page }) => {
    await page.goto("/dev/canvas?fixture=site");
    await expect(frameBody(page, "home-desktop")).toBeVisible();
    await expect(host(page)).toHaveCount(0);
    await page.goto("/dev/editor?kind=canvas");
    await expect(page.locator("[data-canvas-board]:visible")).toBeVisible();
    await expect(host(page)).toHaveCount(0);
  });
});
