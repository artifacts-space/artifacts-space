import type { Locator, Page } from "@playwright/test";
import { allowPageError, expect, test } from "./support/test";

/**
 * The /app workspace's resizable sidebar, on /dev/workspace (the real
 * workspace without a database): a handle on the sidebar's right edge sizes
 * its width, and the sidebar can be hidden. The width is remembered per
 * viewer; phones and tablets, where the sidebar stacks over the artifact,
 * have no handle.
 */

const desktop = { width: 1440, height: 900 };
const sidebarKey = "artifacts.space:workspace:sidebar-width";
/** The Projects rows' height, remembered before the tree replaced them: still in some browsers, and ignored. */
const projectsKey = "artifacts.space:workspace:projects-height";

const sidebarHandle = (page: Page) => page.getByRole("separator", { name: "Resize the sidebar" });
const sidebar = (page: Page) => page.locator("aside#workspace-sidebar");
const list = (page: Page) => page.locator("[data-slot=artifact-list]");

async function openWorkspace(page: Page, viewport = desktop) {
  await page.setViewportSize(viewport);
  await page.goto("/dev/workspace");
  await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
  // The handles report their real bounds once they have measured the page.
  await expect(sidebarHandle(page)).toHaveAttribute("data-measured", "");
}

function widthOf(box: Locator) {
  return box.evaluate((element) => Math.round(element.getBoundingClientRect().width));
}

/** How far the sidebar handle's left edge is from the sidebar's right edge, in pixels. */
async function sidebarEdgeGap(page: Page) {
  const [handle, aside] = await Promise.all([sidebarHandle(page).boundingBox(), sidebar(page).boundingBox()]);
  if (!handle || !aside) return Number.POSITIVE_INFINITY;
  return Math.abs(handle.x - (aside.x + aside.width));
}

/** Drags a handle by `dx`, `dy` pixels with real mouse moves. */
async function dragBy(page: Page, handle: Locator, dx: number, dy: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error("The handle is not on screen.");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

/** Stores panel sizes before every page load, as a returning viewer would have them. */
function storeSizes(page: Page, sizes: Record<string, string>) {
  return page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, value);
  }, sizes);
}

function stored(page: Page, key: string) {
  return page.evaluate((name) => window.localStorage.getItem(name), key);
}

/** The page's own scroll size against the viewport. */
function pageScroll(page: Page) {
  return page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return { width: root.scrollWidth, clientWidth: document.documentElement.clientWidth };
  });
}

/** Collects console errors and warnings and uncaught errors, such as a hydration mismatch. */
function collectProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

/** `--brand` as the browser resolves it, to compare with the focus ring. */
function brandColor(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--brand)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
}

/** The color of a handle's line, drawn by its ::after. */
function lineColor(handle: Locator) {
  return handle.evaluate((element) => getComputedStyle(element, "::after").backgroundColor);
}

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "phones have no handles; checked below");

  test("should resize the sidebar by dragging and from the keyboard, within its bounds", async ({ page }) => {
    await openWorkspace(page);
    const handle = sidebarHandle(page);
    await expect(handle).toHaveAttribute("aria-orientation", "vertical");
    await expect(handle).toHaveAttribute("aria-controls", "workspace-sidebar");
    await expect(handle).toHaveAttribute("aria-valuenow", "280");
    await expect(handle).toHaveAttribute("aria-valuemin", "272");
    await expect(handle).toHaveAttribute("aria-valuemax", "520");
    expect(await handle.evaluate((element) => getComputedStyle(element).cursor)).toBe("col-resize");

    await dragBy(page, handle, 120, 0);
    expect(await widthOf(sidebar(page))).toBe(400);
    // A drag focuses the handle for the keyboard, but never shows the keyboard focus line or a ring.
    await expect(handle).toBeFocused();
    await expect(handle).not.toHaveAttribute("data-keyboard");
    expect(await lineColor(handle)).not.toBe(await brandColor(page));
    expect(await handle.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
    await expect(handle).toHaveAttribute("aria-valuenow", "400");
    expect(await sidebarEdgeGap(page), "the handle sits on the sidebar's right edge").toBeLessThan(2);

    // Past either edge, the drag stops at the bounds.
    await dragBy(page, handle, 600, 0);
    expect(await widthOf(sidebar(page))).toBe(520);
    expect(await sidebarEdgeGap(page), "the handle follows the clamped edge").toBeLessThan(2);
    expect(await widthOf(page.getByRole("region", { name: "Content" })), "the artifact pane keeps a usable width").toBeGreaterThanOrEqual(480);
    await dragBy(page, handle, -600, 0);
    expect(await widthOf(sidebar(page))).toBe(272);

    await handle.press("End");
    expect(await widthOf(sidebar(page))).toBe(520);
    await handle.press("Home");
    expect(await widthOf(sidebar(page))).toBe(272);
    await handle.press("ArrowRight");
    await expect(handle).toHaveAttribute("aria-valuenow", "288");
    await handle.press("Shift+ArrowRight");
    await expect(handle).toHaveAttribute("aria-valuenow", "352");
    await handle.press("ArrowLeft");
    expect(await widthOf(sidebar(page))).toBe(336);
    await expect(handle).toHaveAttribute("aria-valuetext", "336 pixels");
    await expect(handle).toHaveAccessibleDescription(/Left and Right arrows to resize/);
    // Enter goes back to the default, as a double-click does.
    await handle.press("Enter");
    expect(await widthOf(sidebar(page))).toBe(280);
    expect(await stored(page, sidebarKey)).toBeNull();
    await handle.press("ArrowLeft");

    // From the keyboard, focus shows as the handle's line in --brand, with no ring boxing the grab area.
    const brand = await brandColor(page);
    // The line fades between colors, so wait for it to settle on the brand.
    await expect.poll(() => lineColor(handle)).toBe(brand);
    expect(await handle.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
    // A pointer press hands the handle back to the pointer, and leaving it clears the keyboard state.
    await dragBy(page, handle, 16, 0);
    await expect(handle).not.toHaveAttribute("data-keyboard");
    await handle.press("ArrowLeft");
    await expect(handle).toHaveAttribute("data-keyboard", "");
    await handle.blur();
    await expect(handle).not.toHaveAttribute("data-keyboard");
    const scroll = await pageScroll(page);
    expect(scroll.width, "no horizontal page scroll").toBeLessThanOrEqual(scroll.clientWidth + 1);
  });

  test("should outline a keyboard-driven handle in forced colors, where the line's background is dropped", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openWorkspace(page);
    const handle = sidebarHandle(page);
    const outline = () => handle.evaluate((element) => getComputedStyle(element).outlineStyle);

    await dragBy(page, handle, 16, 0);
    await expect(handle).toBeFocused();
    expect(await outline(), "no outline after a drag").toBe("none");
    await handle.press("ArrowLeft");
    await expect.poll(outline, "an outline from the keyboard").toBe("solid");
  });

  test("should leave the artifact pane at least 480px beside the widest sidebar on the narrowest desktop", async ({ page }) => {
    // At 1024 px, the narrowest window with the sidebar beside the artifact, the 520 px cap leaves the pane over 480 px, so no floor is needed.
    await openWorkspace(page, { width: 1024, height: 900 });
    const handle = sidebarHandle(page);
    await handle.press("End");
    const widest = await widthOf(sidebar(page));
    await expect(handle).toHaveAttribute("aria-valuemax", String(widest));
    expect(await widthOf(page.getByRole("region", { name: "Content" })), "the pane keeps its floor").toBeGreaterThanOrEqual(480);
    expect(await sidebarEdgeGap(page), "the handle stays on the sidebar's edge").toBeLessThan(2);
    await dragBy(page, handle, 200, 0);
    expect(await widthOf(sidebar(page)), "a drag stops at the same edge").toBe(widest);
    expect(await sidebarEdgeGap(page)).toBeLessThan(2);
    const scroll = await pageScroll(page);
    expect(scroll.width, "no horizontal page scroll").toBeLessThanOrEqual(scroll.clientWidth + 1);
  });

  test("should fit the search row and artifact titles when the sidebar is at its narrowest", async ({ page }) => {
    await openWorkspace(page);
    await sidebarHandle(page).press("Home");
    const right = (box: Locator) => box.evaluate((element) => Math.round(element.getBoundingClientRect().right));
    expect(await widthOf(page.getByRole("textbox", { name: "Search artifacts" })), "the search keeps room to type").toBeGreaterThanOrEqual(140);
    expect(await right(page.getByRole("button", { name: "New artifact" })), "New artifact stays inside the sidebar").toBeLessThanOrEqual(await right(sidebar(page)));
    const switcherName = page.locator("[data-slot=workspace-name]");
    expect(await switcherName.evaluate((element) => element.scrollWidth <= element.clientWidth), "the workspace name shows in full").toBe(true);
    // Titles are the viewer's own text and wrap to two lines, so measure the room: about 20 characters a line.
    const title = list(page).getByText("Long markdown fixture", { exact: true });
    expect(await widthOf(title), "an artifact title keeps room for about 20 characters").toBeGreaterThanOrEqual(150);
  });

  test("should remember the width after a reload and go back to the default on double-click", async ({ page }) => {
    const problems = collectProblems(page);
    await openWorkspace(page);
    await sidebarHandle(page).press("End");
    expect(await stored(page, sidebarKey)).toBe("520");

    await page.reload();
    await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
    expect(await widthOf(sidebar(page))).toBe(520);

    await sidebarHandle(page).dblclick();
    expect(await widthOf(sidebar(page))).toBe(280);
    await expect(sidebarHandle(page)).toHaveAttribute("aria-valuenow", "280");
    expect(await stored(page, sidebarKey)).toBeNull();

    // A filter remounts the workspace on the client, so the before-paint script renders again there, inert.
    await sidebarHandle(page).press("ArrowRight");
    await page.getByRole("region", { name: "Projects" }).getByRole("button", { name: /^Design, / }).click();
    await expect(page).toHaveURL(/project=design/);
    await expect(sidebarHandle(page)).toHaveAttribute("aria-valuenow", "296");
    expect(await widthOf(sidebar(page))).toBe(296);
    expect(problems, "no hydration or script warnings").toEqual([]);
  });

  test("should open at the stored sizes from the server HTML, before the page hydrates", async ({ page }) => {
    await storeSizes(page, { [sidebarKey]: "400" });
    await page.setViewportSize(desktop);
    // Hold the page's scripts so only the server HTML and its inline script run.
    allowPageError("net::ERR_FAILED", "The test refuses the page's scripts on purpose.");
    let held = 0;
    await page.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, (route) => {
      held += 1;
      return route.abort();
    });
    await page.goto("/dev/workspace", { waitUntil: "domcontentloaded" });
    expect(held, "the page's scripts were held back").toBeGreaterThan(0);
    await expect(sidebarHandle(page), "the page has not hydrated").not.toHaveAttribute("data-measured");
    expect(await widthOf(sidebar(page))).toBe(400);
  });

  test("should ignore stored sizes outside the bounds and draw the nearest allowed size", async ({ page }) => {
    await storeSizes(page, { [sidebarKey]: "3000", [projectsKey]: "1" });
    await openWorkspace(page);
    expect(await widthOf(sidebar(page))).toBe(520);
  });

  test("should hide the sidebar so the artifact takes the width, and bring it back from the top bar", async ({ page }) => {
    await openWorkspace(page);
    const content = page.getByRole("region", { name: "Content" });
    const before = await widthOf(content);
    const hide = page.getByRole("button", { name: "Hide the sidebar" });
    await hide.focus();
    await page.keyboard.press("Enter");
    await expect(sidebar(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "Show the sidebar" }), "focus moves to the button that brings it back").toBeFocused();
    await expect(sidebarHandle(page)).toHaveCount(0);
    expect(await widthOf(content), "the artifact takes the sidebar's room").toBeGreaterThan(before + 200);
    const slashTaken = await page.evaluate(() => {
      const press = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
      document.body.dispatchEvent(press);
      return press.defaultPrevented;
    });
    expect(slashTaken, "a hidden search leaves the / key to the page").toBe(false);
    await page.keyboard.press("Enter");
    await expect(sidebar(page)).toBeVisible();
    await expect(hide, "and back to Hide when the sidebar returns").toBeFocused();
    await expect(page.getByRole("button", { name: "Show the sidebar" })).toHaveCount(0);
    expect(await widthOf(content)).toBe(before);
  });

  test("should keep working and stay quiet when the browser blocks storage", async ({ page }) => {
    await page.addInitScript(() => {
      const blocked = () => { throw new DOMException("Storage is blocked", "SecurityError"); };
      Storage.prototype.getItem = blocked;
      Storage.prototype.setItem = blocked;
      Storage.prototype.removeItem = blocked;
    });
    const problems = collectProblems(page);
    await openWorkspace(page);
    await sidebarHandle(page).press("End");
    expect(await widthOf(sidebar(page))).toBe(520);
    // The size holds for the visit, through a client remount, though it cannot be stored.
    await page.getByRole("region", { name: "Projects" }).getByRole("button", { name: /^Design, / }).click();
    await expect(page).toHaveURL(/project=design/);
    expect(await widthOf(sidebar(page))).toBe(520);
    await sidebarHandle(page).dblclick();
    expect(await widthOf(sidebar(page))).toBe(280);
    expect(problems).toEqual([]);
  });

  test("should move the width on the grid and the handle alone while it changes, and on the root once it ends", async ({ page }) => {
    await openWorkspace(page);
    const handle = sidebarHandle(page);
    const rootWidth = () => page.evaluate(() => document.documentElement.style.getPropertyValue("--workspace-sidebar-width"));
    /** The live width on the workspace grid and on the handle, the two elements that read it. */
    const liveWidths = () => handle.evaluate((element) => [element.parentElement, element].map((reader) => reader?.style.getPropertyValue("--workspace-sidebar-width-live") ?? "missing"));
    // Not inherited: a move restyles the two readers, never the elements under the grid.
    expect(await sidebar(page).evaluate((element) => getComputedStyle(element).getPropertyValue("--workspace-sidebar-width-live"))).toBe("");

    const box = await handle.boundingBox();
    if (!box) throw new Error("The handle is not on screen.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
    expect(await widthOf(sidebar(page))).toBe(340);
    expect(await liveWidths()).toEqual(["340px", "340px"]);
    expect(await rootWidth(), "the root keeps its value while the drag moves").toBe("");
    expect(await stored(page, sidebarKey)).toBeNull();
    expect(await sidebar(page).evaluate((element) => getComputedStyle(element).getPropertyValue("--workspace-sidebar-width-live")), "the sidebar under the grid does not inherit it").toBe("");
    await page.mouse.up();
    expect(await liveWidths()).toEqual(["", ""]);
    expect(await rootWidth()).toBe("340px");
    expect(await stored(page, sidebarKey)).toBe("340");
    expect(await widthOf(sidebar(page))).toBe(340);
    expect(await sidebarEdgeGap(page)).toBeLessThan(2);

    // A held arrow key repeats: the width moves on the readers, and reaches the root and storage on key up.
    await handle.focus();
    await page.keyboard.down("ArrowRight");
    await page.keyboard.down("ArrowRight");
    expect(await widthOf(sidebar(page))).toBe(372);
    expect(await liveWidths()).toEqual(["372px", "372px"]);
    expect(await rootWidth()).toBe("340px");
    await page.keyboard.up("ArrowRight");
    expect(await liveWidths()).toEqual(["", ""]);
    expect(await rootWidth()).toBe("372px");
    expect(await stored(page, sidebarKey)).toBe("372");

    // A key still held when focus leaves is kept, and a reset clears both.
    await page.keyboard.down("ArrowRight");
    await handle.blur();
    expect(await liveWidths()).toEqual(["", ""]);
    expect(await rootWidth()).toBe("388px");
    await page.keyboard.up("ArrowRight");
    await handle.dblclick();
    expect(await liveWidths()).toEqual(["", ""]);
    expect(await rootWidth()).toBe("");
    expect(await widthOf(sidebar(page))).toBe(280);
  });

  test("should point the cursor the only way the handle can go when the sidebar is at its smallest or largest", async ({ page }) => {
    await openWorkspace(page);
    const handle = sidebarHandle(page);
    const handleCursor = () => handle.evaluate((element) => getComputedStyle(element).cursor);
    const pageCursor = () => page.evaluate(() => document.documentElement.style.cursor);
    const box = await handle.boundingBox();
    if (!box) throw new Error("The handle is not on screen.");
    const y = box.y + box.height / 2;

    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    expect(await pageCursor()).toBe("col-resize");
    // Past the smallest size it can only grow, so the cursor points right, over the whole page.
    await page.mouse.move(box.x - 300, y, { steps: 4 });
    expect(await widthOf(sidebar(page))).toBe(272);
    expect(await pageCursor()).toBe("e-resize");
    // Back between the limits it points both ways again.
    await page.mouse.move(box.x + 60, y, { steps: 4 });
    expect(await pageCursor()).toBe("col-resize");
    await page.mouse.move(box.x + 600, y, { steps: 4 });
    expect(await widthOf(sidebar(page))).toBe(520);
    expect(await pageCursor()).toBe("w-resize");
    await page.mouse.up();
    expect(await pageCursor()).toBe("");
    // At rest the handle's own cursor says the same.
    expect(await handleCursor()).toBe("w-resize");
    await handle.press("Home");
    expect(await handleCursor()).toBe("e-resize");
    await handle.press("ArrowRight");
    expect(await handleCursor()).toBe("col-resize");
  });

  test("should end a cancelled drag without leaving the resize cursor on the page", async ({ page }) => {
    await openWorkspace(page);
    const handle = sidebarHandle(page);
    const box = await handle.boundingBox();
    if (!box) throw new Error("The handle is not on screen.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
    await expect(handle).toHaveAttribute("data-dragging", "");
    expect(await page.evaluate(() => document.documentElement.style.cursor)).toBe("col-resize");
    await handle.dispatchEvent("pointercancel", { pointerId: 1, isPrimary: true, pointerType: "mouse" });
    await expect(handle).not.toHaveAttribute("data-dragging");
    expect(await page.evaluate(() => document.documentElement.style.cursor)).toBe("");
    await page.mouse.up();
  });

  test("should let the tree scroll to its last artifact on a short, wide window instead of cutting it off", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto("/dev/workspace");
    await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
    const last = list(page).locator("li").last();
    await last.scrollIntoViewIfNeeded();
    const aside = await sidebar(page).boundingBox();
    const row = await last.boundingBox();
    expect((row?.y ?? 0) + (row?.height ?? 0), "the last artifact is inside the sidebar").toBeLessThanOrEqual((aside?.y ?? 0) + (aside?.height ?? 0) + 1);
    await expect(last).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY), "the page itself does not scroll").toBe(0);
  });

  test("should have no handles on a tablet, where the sidebar stacks over the artifact", async ({ page }) => {
    await storeSizes(page, { [sidebarKey]: "520" });
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto("/dev/workspace");
    await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
    await expect(sidebarHandle(page)).toHaveCount(0);
    await expect(page.getByRole("separator", { name: /^Resize/ })).toHaveCount(0);
    const aside = await sidebar(page).boundingBox();
    const content = await page.getByRole("region", { name: "Content" }).boundingBox();
    expect(aside?.width ?? 0, "the stored width does not apply").toBeGreaterThan(700);
    expect(content?.y ?? 0, "the artifact sits under the sidebar").toBeGreaterThan((aside?.y ?? 0) + (aside?.height ?? 0) - 1);
  });
});

test.describe("touch screen", () => {
  test.skip(({ isMobile }) => isMobile, "phones have no handles; checked below");
  test.use({ hasTouch: true });

  test("should give a finger a wider handle that reaches over the sidebar's edge and stays clear of Hide the sidebar", async ({ page }) => {
    await openWorkspace(page, { width: 1280, height: 800 });
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "the test runs with a coarse pointer").toBe(true);
    const handle = sidebarHandle(page);
    const [box, aside, hide] = await Promise.all([handle.boundingBox(), sidebar(page).boundingBox(), page.getByRole("button", { name: "Hide the sidebar" }).boundingBox()]);
    if (!box || !aside || !hide) throw new Error("The handle, the sidebar, or its Hide button is not on screen.");
    const edge = aside.x + aside.width;
    expect(Math.round(box.x - edge), "it starts 8px before the sidebar's edge").toBe(-8);
    expect(Math.round(box.width)).toBe(20);
    expect(hide.x + hide.width, "the Hide button stays outside the handle").toBeLessThanOrEqual(box.x);
    // The line stays on the border, not on the handle's new left edge.
    const line = await handle.evaluate((element) => Math.round(element.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(element, "::after").left)));
    expect(Math.abs(line - Math.round(edge))).toBeLessThanOrEqual(1);

    // A press on the sidebar's side of the border drags it.
    const y = box.y + box.height / 2;
    await page.mouse.move(edge - 6, y);
    await page.mouse.down();
    await page.mouse.move(edge + 54, y, { steps: 4 });
    await page.mouse.up();
    expect(await widthOf(sidebar(page))).toBe(340);
    await page.getByRole("button", { name: "Hide the sidebar" }).click();
    await expect(sidebar(page)).toBeHidden();
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "the phone layout");

  test("should show no resize handles and no sideways scroll on a phone, even with stored sizes", async ({ page }) => {
    await storeSizes(page, { [sidebarKey]: "520", [projectsKey]: "300" });
    await page.goto("/dev/workspace");
    await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
    await expect(page.getByRole("separator", { name: /^Resize/ })).toHaveCount(0);
    expect(await page.locator("[data-slot=panel-splitter]").evaluateAll((handles) => handles.filter((handle) => handle.getBoundingClientRect().width > 0).length)).toBe(0);
    const scroll = await pageScroll(page);
    expect(scroll.width, "no horizontal page scroll").toBeLessThanOrEqual(scroll.clientWidth + 1);
    const viewport = page.viewportSize();
    expect(await widthOf(sidebar(page)), "the sidebar spans the card").toBeGreaterThan((viewport?.width ?? 0) - 64);
  });
});
