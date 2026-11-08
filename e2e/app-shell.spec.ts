import { expect, test, type Locator, type Page } from "@playwright/test";

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
