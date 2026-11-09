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
    await expect(handle).toHaveAttribute("aria-valuenow", "400");

    // Past either edge, the drag stops at the bounds.
    await dragBy(page, handle, 600, 0);
    expect(await widthOf(sidebar(page))).toBe(520);
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

    // The keyboard focus ring is drawn in --brand.
    const ring = await handle.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(ring).toContain(await brandColor(page));
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
    const title = list(page).getByRole("heading", { name: "Long markdown fixture" });
    expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth), "a card title fits").toBe(true);
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
    await page.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, (route) => route.abort());
    await page.goto("/dev/workspace", { waitUntil: "domcontentloaded" });
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
