import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The /app workspace's resizable panels, on /dev/workspace (the real
 * workspace without a database): a handle on the sidebar's right edge sizes
 * its width, and one under the Projects rows trades height with the artifact
 * list. Sizes are remembered per viewer; phones and tablets, where the
 * sidebar stacks over the artifact, have no handles.
 */

const desktop = { width: 1440, height: 900 };
const sidebarKey = "artifacts.space:workspace:sidebar-width";
const projectsKey = "artifacts.space:workspace:projects-height";

const sidebarHandle = (page: Page) => page.getByRole("separator", { name: "Resize the sidebar" });
const projectsHandle = (page: Page) => page.getByRole("separator", { name: "Resize the projects" });
const sidebar = (page: Page) => page.locator("aside#workspace-sidebar");
const rows = (page: Page) => page.locator("[data-slot=sidebar-projects]");
const list = (page: Page) => page.locator("[data-slot=artifact-list]");

async function openWorkspace(page: Page, viewport = desktop) {
  await page.setViewportSize(viewport);
  await page.goto("/dev/workspace");
  await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
  // The handles report their real bounds once they have measured the page.
  await expect(sidebarHandle(page)).toHaveAttribute("data-measured", "");
  await expect(projectsHandle(page)).toHaveAttribute("data-measured", "");
}

function widthOf(box: Locator) {
  return box.evaluate((element) => Math.round(element.getBoundingClientRect().width));
}

function heightOf(box: Locator) {
  return box.evaluate((element) => Math.round(element.getBoundingClientRect().height));
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
    expect(await lineColor(handle)).toBe(await brandColor(page));
    expect(await handle.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
    const scroll = await pageScroll(page);
    expect(scroll.width, "no horizontal page scroll").toBeLessThanOrEqual(scroll.clientWidth + 1);
  });

  test("should stop the sidebar where the artifact pane keeps its minimum width on a narrow desktop", async ({ page }) => {
    // At 1024 px the workspace card is under 1000 px wide, so the pane's 480 px floor binds before the 520 px cap.
    await openWorkspace(page, { width: 1024, height: 900 });
    const card = await sidebar(page).evaluate((element) => element.parentElement?.clientWidth ?? 0);
    const widest = card - 480;
    expect(widest, "the floor binds before the cap").toBeLessThan(520);
    const handle = sidebarHandle(page);
    await expect(handle).toHaveAttribute("aria-valuemax", String(widest));
    await handle.press("End");
    expect(await widthOf(sidebar(page))).toBe(widest);
    expect(await sidebarEdgeGap(page), "the handle stays on the sidebar's edge").toBeLessThan(2);
    await dragBy(page, handle, 200, 0);
    expect(await widthOf(sidebar(page)), "a drag stops at the same edge").toBe(widest);
    expect(await sidebarEdgeGap(page)).toBeLessThan(2);
    const scroll = await pageScroll(page);
    expect(scroll.width, "no horizontal page scroll").toBeLessThanOrEqual(scroll.clientWidth + 1);
  });

  test("should fit the filters and card titles when the sidebar is at its narrowest", async ({ page }) => {
    await openWorkspace(page);
    await sidebarHandle(page).press("Home");
    for (const name of ["Filter by format", "Filter by project"]) {
      const value = page.getByRole("combobox", { name }).locator("[data-slot=select-value]");
      const fit = await value.evaluate((element) => element.scrollWidth <= element.clientWidth);
      expect(fit, `${name} shows its whole label`).toBe(true);
    }
    // Titles are the viewer's own text and truncate, so measure the room: about 20 characters, with the date beside it in full.
    const title = list(page).getByRole("heading", { name: "Long markdown fixture" });
    const room = await title.evaluate((element) => {
      const date = element.nextElementSibling;
      return { title: element.clientWidth, dateFits: date !== null && date.scrollWidth <= date.clientWidth };
    });
    expect(room.title, "a card title keeps room for about 20 characters").toBeGreaterThanOrEqual(150);
    expect(room.dateFits, "the date beside it shows in full").toBe(true);
  });

  test("should trade height between the Projects rows and the list within their bounds", async ({ page }) => {
    await openWorkspace(page);
    const handle = projectsHandle(page);
    await expect(handle).toHaveAttribute("aria-orientation", "horizontal");
    expect(await handle.evaluate((element) => getComputedStyle(element).cursor)).toBe("row-resize");
    const total = (await heightOf(rows(page))) + (await heightOf(list(page)));
    const tallest = Number(await handle.getAttribute("aria-valuemax"));
    expect(await heightOf(rows(page)), "the rows show in full by default").toBe(tallest);

    await handle.press("Home");
    expect(await heightOf(rows(page))).toBe(64);
    await expect(handle).toHaveAttribute("aria-valuenow", "64");
    const handleBox = await handle.boundingBox();
    const rowsBox = await rows(page).boundingBox();
    const centre = (handleBox?.y ?? 0) + (handleBox?.height ?? 0) / 2;
    expect(Math.abs(centre - ((rowsBox?.y ?? 0) + (rowsBox?.height ?? 0))), "the handle straddles the rows' bottom edge").toBeLessThan(10);
    await expect(handle).toHaveAccessibleDescription(/Up and Down arrows/);
    expect((await heightOf(rows(page))) + (await heightOf(list(page))), "the list takes the height the rows gave up").toBe(total);

    await dragBy(page, handle, 0, 24);
    expect(await heightOf(rows(page))).toBe(88);
    expect((await heightOf(rows(page))) + (await heightOf(list(page)))).toBe(total);
    await dragBy(page, handle, 0, 600);
    expect(await heightOf(rows(page)), "never taller than the rows need").toBe(tallest);
    await handle.press("ArrowUp");
    await expect(handle).toHaveAttribute("aria-valuenow", String(tallest - 16));

    // Closing the group removes the handle and gives the list the room; opening it brings both back.
    const toggle = page.getByRole("region", { name: "Projects" }).getByRole("button", { name: "Projects" });
    await toggle.click();
    await expect(handle).toHaveCount(0);
    expect(await heightOf(list(page))).toBeGreaterThan(total - tallest);
    await toggle.click();
    await expect(handle).toBeVisible();
    expect(await heightOf(rows(page))).toBe(tallest - 16);
  });

  test("should remember both sizes after a reload and go back to the defaults on double-click", async ({ page }) => {
    const problems = collectProblems(page);
    await openWorkspace(page);
    const defaultRows = await heightOf(rows(page));
    await sidebarHandle(page).press("End");
    await projectsHandle(page).press("Home");
    expect(await stored(page, sidebarKey)).toBe("520");
    expect(await stored(page, projectsKey)).toBe("64");

    await page.reload();
    await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
    expect(await widthOf(sidebar(page))).toBe(520);
    expect(await heightOf(rows(page))).toBe(64);

    await sidebarHandle(page).dblclick();
    expect(await widthOf(sidebar(page))).toBe(280);
    await expect(sidebarHandle(page)).toHaveAttribute("aria-valuenow", "280");
    expect(await stored(page, sidebarKey)).toBeNull();
    await projectsHandle(page).dblclick();
    expect(await heightOf(rows(page))).toBe(defaultRows);
    await expect(projectsHandle(page)).toHaveAttribute("aria-valuenow", String(defaultRows));
    expect(await stored(page, projectsKey)).toBeNull();

    // A filter remounts the workspace on the client, so the before-paint script renders again there, inert.
    await sidebarHandle(page).press("ArrowRight");
    await page.getByRole("region", { name: "Projects" }).getByRole("button", { name: /^Design, / }).click();
    await expect(page).toHaveURL(/project=design/);
    await expect(sidebarHandle(page)).toHaveAttribute("aria-valuenow", "296");
    expect(await widthOf(sidebar(page))).toBe(296);
    expect(problems, "no hydration or script warnings").toEqual([]);
  });

  test("should open at the stored sizes from the server HTML, before the page hydrates", async ({ page }) => {
    await storeSizes(page, { [sidebarKey]: "400", [projectsKey]: "64" });
    await page.setViewportSize(desktop);
    // Hold the page's scripts so only the server HTML and its inline script run.
    let held = 0;
    await page.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, (route) => {
      held += 1;
      return route.abort();
    });
    await page.goto("/dev/workspace", { waitUntil: "domcontentloaded" });
    expect(held, "the page's scripts were held back").toBeGreaterThan(0);
    await expect(sidebarHandle(page), "the page has not hydrated").not.toHaveAttribute("data-measured");
    expect(await widthOf(sidebar(page))).toBe(400);
    expect(await heightOf(rows(page))).toBe(64);
  });

  test("should ignore stored sizes outside the bounds and draw the nearest allowed size", async ({ page }) => {
    await storeSizes(page, { [sidebarKey]: "3000", [projectsKey]: "1" });
    await openWorkspace(page);
    expect(await widthOf(sidebar(page))).toBe(520);
    expect(await heightOf(rows(page))).toBe(64);
  });

  test("should keep the Projects rows below their heading when the rows scroll", async ({ page }) => {
    await openWorkspace(page);
    await projectsHandle(page).press("Home");
    const box = rows(page);
    const heading = page.getByRole("region", { name: "Projects" }).getByRole("button", { name: "Projects" });
    const headingBox = await heading.boundingBox();
    const rowsBox = await box.boundingBox();
    if (!headingBox || !rowsBox) throw new Error("The Projects group is not on screen.");
    expect(rowsBox.y, "the rows start below the heading").toBeGreaterThanOrEqual(headingBox.y + headingBox.height - 0.5);
    await expect(box).not.toHaveAttribute("data-scrolled");

    await box.evaluate((element) => { element.scrollTop = 12; });
    await expect(box).toHaveAttribute("data-scrolled", "");
    const edge = await box.evaluate((element) => getComputedStyle(element).borderTopColor);
    expect(edge, "a divider marks where the rows scroll out of view").not.toBe("rgba(0, 0, 0, 0)");

    // The first row, partly scrolled away, shows only inside the rows box: the heading above it is not covered.
    const hits = await page.evaluate(({ heading: top, rows: area }) => {
      const x = area.x + 40;
      const inHeading = document.elementFromPoint(x, top.y + top.height / 2);
      const atEdge = document.elementFromPoint(x, area.y + 2);
      return {
        heading: inHeading?.closest("button")?.textContent ?? "",
        edge: atEdge?.closest("[data-slot=sidebar-projects]") !== null,
      };
    }, { heading: headingBox, rows: rowsBox });
    expect(hits.heading).toContain("Projects");
    expect(hits.edge, "just under the heading is the rows box").toBe(true);
    const firstRow = box.getByRole("button", { name: /^No project, / });
    const rowTop = await firstRow.evaluate((element) => element.getBoundingClientRect().top);
    expect(rowTop, "the first row has scrolled up out of the box").toBeLessThan(rowsBox.y);
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
    await projectsHandle(page).press("Home");
    expect(await heightOf(rows(page))).toBe(64);
    // The size holds for the visit, through a client remount, though it cannot be stored.
    await page.getByRole("region", { name: "Projects" }).getByRole("button", { name: /^Design, / }).click();
    await expect(page).toHaveURL(/project=design/);
    expect(await widthOf(sidebar(page))).toBe(520);
    await sidebarHandle(page).dblclick();
    expect(await widthOf(sidebar(page))).toBe(280);
    expect(problems).toEqual([]);
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

  test("should let the sidebar scroll to its footer on a short, wide window instead of cutting it off", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto("/dev/workspace");
    await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
    const footer = sidebar(page).getByText(/\d+ shown/);
    await footer.scrollIntoViewIfNeeded();
    const aside = await sidebar(page).boundingBox();
    const foot = await footer.boundingBox();
    expect((foot?.y ?? 0) + (foot?.height ?? 0), "the footer is inside the sidebar").toBeLessThanOrEqual((aside?.y ?? 0) + (aside?.height ?? 0) + 1);
    await expect(footer).toBeInViewport();
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
