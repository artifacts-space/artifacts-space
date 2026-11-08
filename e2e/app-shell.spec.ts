import { expect, test, type Locator, type Page } from "@playwright/test";

import { cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser, versionCount } from "./support/local-db";

/**
 * The /app workspace is an app shell from md up: the page never scrolls, the
 * list and the artifact scroll on their own, and the header controls stay in
 * view. Measured on /dev/workspace, the real workspace with long artifacts
 * and a long list and no database.
 */

const desktop = { width: 1280, height: 800 };

/** The page's own scroll size against the viewport. */
function pageScroll(page: Page) {
  return page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return { height: root.scrollHeight, width: root.scrollWidth, innerHeight: window.innerHeight, innerWidth: window.innerWidth, scrollY: window.scrollY };
  });
}

async function expectPageDoesNotScroll(page: Page) {
  const scroll = await pageScroll(page);
  expect(scroll.height, "the page itself does not scroll").toBeLessThanOrEqual(scroll.innerHeight + 1);
  expect(scroll.width, "no horizontal page scroll").toBeLessThanOrEqual(scroll.innerWidth + 1);
}

const slot = (page: Page, name: string) => page.locator(`[data-slot=${name}]`);

/** A box's rendered width. */
const widthOf = (box: Locator) => box.evaluate((element) => element.getBoundingClientRect().width);

/** The public page's column is 960px with 24px of padding each side, so its content runs 912px wide. */
const pageContent = 912;
const wide = { width: 1600, height: 900 };

/** Scrolls a scroll box to its bottom and returns its scrollTop. */
function scrollToBottom(box: Locator) {
  return box.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
}

/** Elements under the shell that reach past it without a clipping scroll box in their containing-block chain. */
function escapedElements(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector("[data-app-shell]");
    if (!shell) return ["no shell"];
    const bounds = shell.getBoundingClientRect();
    const clips = (element: Element) => getComputedStyle(element).overflowY !== "visible" || getComputedStyle(element).overflowX !== "visible";
    /** The box an absolutely positioned element is placed against (SVG elements have no offsetParent). */
    const containingBlock = (element: Element) => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.position !== "static" || style.transform !== "none" || style.containerType === "size" || /layout|paint|strict|content/.test(style.contain)) return node;
      }
      return null;
    };
    /** True when an ancestor inside the shell that clips also holds the element's containing block. */
    const clipped = (element: Element) => {
      const absolute = getComputedStyle(element).position === "absolute";
      const containing = absolute ? containingBlock(element) : null;
      for (let node = element.parentElement; node && node !== shell.parentElement; node = node.parentElement) {
        if (!clips(node)) continue;
        if (!absolute || (containing !== null && (node === containing || node.contains(containing)))) return true;
      }
      return false;
    };
    /** Shapes inside an SVG are placed by the SVG, and empty boxes take no room; neither is checked. */
    const measurable = (element: Element) => {
      if (element instanceof SVGElement && element.ownerSVGElement) return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 || box.height > 0;
    };
    const outside = (element: Element) => {
      const box = element.getBoundingClientRect();
      return box.bottom > bounds.bottom + 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.left < bounds.left - 1;
    };
    const escaped: string[] = [];
    for (const element of shell.querySelectorAll("*")) {
      if (measurable(element) && outside(element) && !clipped(element)) escaped.push(`${element.tagName.toLowerCase()}.${(element.getAttribute("class") ?? "").slice(0, 60)}`);
    }
    return escaped.slice(0, 10);
  });
}

/** Every scroll box in the shell is a positioning parent and keeps its scroll from chaining to the page. */
function scrollBoxStyles(page: Page) {
  return page.evaluate(() =>
    ["artifact-list", "detail-body", "detail-outer"].map((name) => {
      const element = document.querySelector(`[data-slot=${name}]`);
      const style = element ? getComputedStyle(element) : null;
      return { name, position: style?.position, overflowY: style?.overflowY, overscroll: style?.overscrollBehaviorY };
    }),
  );
}

async function openWorkspace(page: Page, viewport = desktop) {
  await page.setViewportSize(viewport);
  await page.goto("/dev/workspace");
  await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
  await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
}

const controls = (page: Page) => [
  page.getByRole("button", { name: "History" }),
  page.getByRole("tablist", { name: "Editor mode" }),
  page.getByRole("textbox", { name: "Search artifacts" }),
  slot(page, "artifact-list").getByRole("button").first(),
];

async function expectControlsInView(page: Page) {
  for (const control of controls(page)) await expect(control).toBeInViewport();
}

/** Where the header controls sit, to show they do not move. */
function controlTops(page: Page) {
  return Promise.all(controls(page).map(async (control) => Math.round((await control.boundingBox())?.y ?? -1)));
}

/** Sections of the content pane that are shorter than what they hold, or that overlap the section before them. */
function overlappingSections(page: Page) {
  return slot(page, "detail-body").evaluate((body) => {
    const problems: string[] = [];
    let previousBottom = Number.NEGATIVE_INFINITY;
    for (const [index, child] of [...body.children].entries()) {
      const box = child.getBoundingClientRect();
      if (child.scrollHeight > child.clientHeight + 1) problems.push(`section ${String(index)} is ${String(Math.round(box.height))}px but holds ${String(child.scrollHeight)}px`);
      if (box.top < previousBottom - 1) problems.push(`section ${String(index)} overlaps the one before it`);
      previousBottom = box.bottom;
    }
    return problems;
  });
}

test.describe("desktop and tablet", () => {
  test.skip(({ isMobile }) => isMobile, "phones keep a page that scrolls");

  test("should keep the sidebar and header controls in view when the artifact scrolls to the bottom", async ({ page }) => {
    await openWorkspace(page);
    await expectPageDoesNotScroll(page);
    const tops = await controlTops(page);

    const body = slot(page, "detail-body");
    expect(await scrollToBottom(body), "the content pane scrolls").toBeGreaterThan(1000);
    await expectControlsInView(page);
    expect(await controlTops(page), "the controls do not move").toEqual(tops);
    expect(await pageScroll(page).then((scroll) => scroll.scrollY)).toBe(0);

    // The list scrolls on its own and leaves the artifact where it was.
    const contentTop = await body.evaluate((element) => element.scrollTop);
    expect(await scrollToBottom(slot(page, "artifact-list")), "the list scrolls").toBeGreaterThan(100);
    await expect(page.getByRole("textbox", { name: "Search artifacts" })).toBeInViewport();
    expect(await body.evaluate((element) => element.scrollTop)).toBe(contentTop);
    await expectPageDoesNotScroll(page);

    // Charts and screen-reader text in the long preview are positioned elements; none escapes its scroll box.
    expect(await escapedElements(page)).toEqual([]);
    for (const box of await scrollBoxStyles(page)) {
      expect(box.position, `${box.name} is a positioning parent`).toBe("relative");
    }
    const styles = await scrollBoxStyles(page);
    expect(styles.find((box) => box.name === "artifact-list")).toMatchObject({ overflowY: "auto", overscroll: "contain" });
    expect(styles.find((box) => box.name === "detail-body")).toMatchObject({ overflowY: "auto", overscroll: "contain" });
  });

  test("should stack a long artifact above its files, fields, and comments without overlap in both modes", async ({ page }) => {
    await openWorkspace(page);
    expect(await overlappingSections(page), "preview").toEqual([]);
    await page.getByRole("tab", { name: "edit" }).click();
    await expect(page.getByRole("textbox", { name: "Artifact content" })).toBeVisible();
    expect(await overlappingSections(page), "edit").toEqual([]);
  });

  test("should leave room under the last section when the artifact scrolls to its end", async ({ page }) => {
    await openWorkspace(page);
    const body = slot(page, "detail-body");
    await scrollToBottom(body);
    const gap = await body.evaluate((element) => {
      const last = element.lastElementChild?.getBoundingClientRect();
      return last ? element.getBoundingClientRect().bottom - last.bottom : 0;
    });
    expect(gap, "space between the last section and the pane's bottom edge").toBeGreaterThanOrEqual(32);
  });

  test("should open the comments in a dialog from the toolbar beside History, not under the content", async ({ page }) => {
    await openWorkspace(page);
    await expect(slot(page, "detail-body").getByRole("region", { name: "Comments" })).toHaveCount(0);
    const toolbarComments = page.getByRole("button", { name: "Comments" });
    await expect(toolbarComments).toBeInViewport();
    await toolbarComments.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /^Comments on / })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("should scroll the source inside the pane in Edit mode, with one scroll bar", async ({ page }) => {
    await openWorkspace(page);
    const tops = await controlTops(page);
    await page.getByRole("tab", { name: "edit" }).click();
    const source = page.getByRole("textbox", { name: "Artifact content" });
    await expect(source).toBeVisible();
    await expectPageDoesNotScroll(page);
    expect(await controlTops(page), "switching modes moves nothing in the header").toEqual(tops);

    // The field grows with its text, so only the pane scrolls.
    expect(await source.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    expect(await scrollToBottom(slot(page, "detail-body"))).toBeGreaterThan(1000);
    await expectControlsInView(page);
    await expectPageDoesNotScroll(page);
    expect(await escapedElements(page)).toEqual([]);
  });

  test("should keep the place when switching modes and start a newly picked artifact at the top", async ({ page }) => {
    await openWorkspace(page);
    const body = slot(page, "detail-body");
    await body.evaluate((element) => { element.scrollTop = (element.scrollHeight - element.clientHeight) / 2; });
    await page.getByRole("tab", { name: "edit" }).click();
    await expect(page.getByRole("textbox", { name: "Artifact content" })).toBeVisible();
    const share = await body.evaluate((element) => element.scrollTop / (element.scrollHeight - element.clientHeight));
    expect(share, "Edit opens about as far down as the preview was").toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);

    await slot(page, "artifact-list").getByRole("button", { name: /Long markdown fixture/ }).click();
    await expect(page.getByRole("textbox", { name: "Artifact title" })).toHaveValue("Long markdown fixture");
    expect(await slot(page, "detail-body").evaluate((element) => element.scrollTop), "a new artifact starts at the top").toBe(0);
  });

  test("should scroll the preview from the keyboard and never the page", async ({ page }) => {
    await openWorkspace(page);
    const body = slot(page, "detail-body");
    await body.focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
    await page.keyboard.press("End");
    await expect.poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1);
    expect((await pageScroll(page)).scrollY).toBe(0);
  });

  test("should fit the CSV grid inside the pane so only one box scrolls at a time", async ({ page }) => {
    await openWorkspace(page);
    await slot(page, "artifact-list").getByRole("button", { name: /Long csv fixture/ }).click();
    const grid = page.getByRole("grid", { name: "CSV table" });
    await expect(grid).toBeVisible();
    const sizes = await page.evaluate(() => {
      const body = document.querySelector("[data-slot=detail-body]");
      const scroller = document.querySelector("[role=grid]")?.parentElement;
      return { pane: body?.clientHeight ?? 0, grid: scroller?.getBoundingClientRect().height ?? Infinity, gridScrolls: (scroller?.scrollHeight ?? 0) > (scroller?.clientHeight ?? 0) };
    });
    expect(sizes.gridScrolls, "the grid scrolls its rows").toBe(true);
    expect(sizes.grid, "the grid is no taller than the pane").toBeLessThanOrEqual(sizes.pane);
    await expectPageDoesNotScroll(page);
  });

  test("should let the title scroll away on a short viewport while the toolbar and Edit/Preview bar stay", async ({ page }) => {
    await openWorkspace(page, { width: 1280, height: 640 });
    await expectPageDoesNotScroll(page);
    const outer = slot(page, "detail-outer");
    expect(await scrollToBottom(outer), "the whole area under the toolbar scrolls").toBeGreaterThan(1000);
    await expect(page.getByRole("textbox", { name: "Artifact title" })).not.toBeInViewport();
    await expectControlsInView(page);
    await expectPageDoesNotScroll(page);
    expect(await escapedElements(page)).toEqual([]);
    const style = await outer.evaluate((element) => ({ position: getComputedStyle(element).position, overscroll: getComputedStyle(element).overscrollBehaviorY }));
    expect(style).toEqual({ position: "relative", overscroll: "contain" });
  });

  test("should fill a tablet screen without a page scroll", async ({ page }) => {
    await openWorkspace(page, { width: 820, height: 1180 });
    await expectPageDoesNotScroll(page);
    await scrollToBottom(slot(page, "detail-body"));
    await expectControlsInView(page);
    await expectPageDoesNotScroll(page);
  });
});

test.describe("open and page column", () => {
  test.skip(({ isMobile }) => isMobile, "measured on desktop; the phone check is below");

  test("should open the artifact's own page in a new tab from beside the copy button", async ({ page }) => {
    await openWorkspace(page, wide);
    const open = page.getByRole("link", { name: "Open the artifact page in a new tab" });
    await expect(open).toHaveAttribute("href", "/artifact/fixtureworkspace0000ui");
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", /noopener/);
    await expect(open).toHaveText("Open");
    // Hover again until the page has hydrated and the tooltip answers.
    await expect(async () => {
      await page.mouse.move(0, 0);
      await open.hover();
      await expect(page.locator("[data-slot=tooltip-content]")).toHaveText("Open its page in a new tab", { timeout: 1000 });
    }).toPass();
  });

  test("should hold the whole preview and the source field to the centered page column when Full width is off", async ({ page }) => {
    await openWorkspace(page, wide);
    const body = slot(page, "detail-body");
    expect(await widthOf(body), "the pane is wider than the page column").toBeGreaterThan(1000);
    const column = body.locator("[data-slot=page-column]");
    expect(await widthOf(column)).toBeLessThanOrEqual(960);
    const gaps = await column.evaluate((element) => {
      const pane = element.parentElement?.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return pane ? { left: box.left - pane.left, right: pane.right - box.right } : { left: -1, right: 0 };
    });
    expect(Math.abs(gaps.left - gaps.right), "the column is centered").toBeLessThanOrEqual(2);
    expect(await widthOf(body.getByRole("note").first()), "a callout keeps to the column").toBeLessThanOrEqual(pageContent + 1);

    await page.getByRole("tab", { name: "edit" }).click();
    expect(await widthOf(page.getByRole("textbox", { name: "Artifact content" })), "the source field keeps to the column").toBeLessThanOrEqual(960);
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "the phone layout");

  test("should keep the artifact's actions pinned under the header while the page scrolls", async ({ page }) => {
    await page.goto("/dev/workspace");
    await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
    const scroll = await pageScroll(page);
    expect(scroll.width, "no horizontal page scroll").toBeLessThanOrEqual(scroll.innerWidth + 1);
    expect(scroll.height, "phones keep a page that scrolls").toBeGreaterThan(scroll.innerHeight);

    await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight / 2); });
    const history = page.getByRole("button", { name: "History" });
    await expect(history).toBeInViewport();
    await expect(page.getByRole("button", { name: /^Save/ })).toBeInViewport();
    const header = await page.getByRole("banner").boundingBox();
    const historyBox = await history.boundingBox();
    expect(historyBox?.y ?? -1, "the actions sit below the app header").toBeGreaterThanOrEqual((header?.y ?? 0) + (header?.height ?? 0) - 1);
    expect(await escapedElements(page), "nothing sticks out sideways").toEqual([]);
  });

  test("should show Open as an icon with its name kept for screen readers", async ({ page }) => {
    await page.goto("/dev/workspace");
    const open = page.getByRole("link", { name: "Open the artifact page in a new tab" });
    await expect(open).toBeVisible();
    expect(await widthOf(open.getByText("Open")), "the label is visually hidden").toBeLessThanOrEqual(1);
    expect(await widthOf(open), "icon only").toBeLessThanOrEqual(40);
  });
});

test("should keep the artifact page scrolling under its pinned header", async ({ page }) => {
  await page.goto("/dev/editor?kind=ui");
  await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
  const scroll = await pageScroll(page);
  expect(scroll.height, "the artifact page scrolls").toBeGreaterThan(scroll.innerHeight * 2);
  await page.evaluate(() => { window.scrollTo(0, 2000); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  // The pinned header row: the logo and who can see the artifact stay on screen.
  await expect(page.getByRole("link", { name: "artifacts.space home" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Private. Only you can see this." })).toBeInViewport();
});

test.describe("full width", () => {
  test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

  const created: string[] = [];
  const paragraph = "A long line of plain prose that runs well past the reading width, so the page width decides how wide it shows. ".repeat(12);

  test.afterAll(async () => {
    await cleanUp(created, []);
  });

  /** Signs in as the dev user and seeds a private Markdown artifact for them. */
  async function seed(page: Page, title: string) {
    await page.goto("/api/dev/sign-in");
    await page.waitForURL(/\/app/);
    const publicId = await createTestArtifact({ userId: await readyDevUser(), title, content: `# Notes\n\n${paragraph}`, visibility: "private", theme: null });
    created.push(publicId);
    return publicId;
  }

  const prose = (page: Page) => slot(page, "detail-body").locator(".artifact-prose").first();
  const proseWidth = (page: Page) => prose(page).evaluate((element) => element.getBoundingClientRect().width);

  test("should widen the content column when Full width is on and keep it after a reload", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "phone", "the /app editor width is measured on desktop; the phone check is below");
    const title = `Full width e2e ${testInfo.project.name}`;
    const publicId = await seed(page, title);
    await page.setViewportSize(desktop);
    await page.goto("/app");
    await slot(page, "artifact-list").getByRole("button", { name: new RegExp(title) }).click();
    await expect(page.getByRole("textbox", { name: "Artifact title" })).toHaveValue(title);
    const pane = slot(page, "detail-body").locator("[data-full-width]");
    await expect(pane).toHaveAttribute("data-full-width", "false");
    const contained = await proseWidth(page);

    await page.getByRole("button", { name: "More actions" }).click();
    const toggle = page.getByRole("menuitemcheckbox", { name: "Full width" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(pane).toHaveAttribute("data-full-width", "true");
    const wide = await proseWidth(page);
    expect(wide, "the text uses the whole pane instead of the reading width").toBeGreaterThan(contained + 100);

    await page.reload();
    await slot(page, "artifact-list").getByRole("button", { name: new RegExp(title) }).click();
    await expect(slot(page, "detail-body").locator("[data-full-width]")).toHaveAttribute("data-full-width", "true");
    expect(Math.round(await proseWidth(page)), "the setting persists").toBe(Math.round(wide));
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Full width" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    expect(await versionCount(publicId), "a display setting files no version").toBe(0);
    await expectPageDoesNotScroll(page);

    // The artifact's own page follows the same setting: wider than the 960px column it has when contained.
    await page.goto(`/artifact/${publicId}`);
    await expect(page.locator("main")).toHaveAttribute("data-full-width", "true");
    expect(await page.locator("main").evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(960);
  });

  test("should keep side padding and no sideways scroll on a full-width page at phone width", async ({ page }, testInfo) => {
    const publicId = await seed(page, `Full width phone e2e ${testInfo.project.name}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Full width" }).click();
    await expect(slot(page, "detail-body").locator("[data-full-width]")).toHaveAttribute("data-full-width", "true");
    expect((await pageScroll(page)).width, "no horizontal scroll in the workspace").toBeLessThanOrEqual(390 + 1);

    await page.goto(`/artifact/${publicId}`);
    const main = page.locator("main");
    await expect(main).toHaveAttribute("data-full-width", "true");
    const scroll = await pageScroll(page);
    expect(scroll.width, "no horizontal page scroll").toBeLessThanOrEqual(scroll.innerWidth + 1);
    const padding = await main.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft));
    expect(padding, "side padding stays").toBeGreaterThanOrEqual(16);
  });
});
