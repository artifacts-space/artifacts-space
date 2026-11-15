import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./support/test";

/*
 * Interface blocks follow the width of the interface, not of the window: a
 * narrow interface on a wide window (a pane, a docs example, a canvas frame)
 * gets the narrow layout. Each check sets the interface's own width on a
 * 1440px window and reads what the block does with it.
 */


/** Interface widths either side of the thresholds the blocks use (`layout.tsx`, `key-value.tsx`, `content.tsx`). */
const widths = {
  /** Below every threshold: a phone-width interface. */
  narrow: 390,
  /** Just past 576px (`@xl/ui`): two grid columns, roomier cards, the larger level-1 heading. */
  pastTwoColumns: 590,
  /** Just past 608px (`@[38rem]/ui`): three grid columns, two key-value columns. */
  pastThreeColumns: 620,
  /** Just past 896px (`@4xl/ui`): four grid columns. */
  pastFourColumns: 900,
} as const;

/** Sets the width of the interface in `scope` (the element itself, or the first one inside it). */
async function setInterfaceWidth(scope: Locator, width: number): Promise<void> {
  await scope.evaluate((element, px) => {
    const nodes = [element, ...element.querySelectorAll("*")];
    const root = nodes.find((node) => getComputedStyle(node).containerName === "ui");
    if (!(root instanceof HTMLElement)) throw new Error("No interface found.");
    root.style.width = `${String(px)}px`;
  }, width);
}

/** Sets the interface's width and returns how many columns `block` (a Grid, or a key-value list) lays out. */
async function columnsAt(scope: Locator, block: Locator, width: number): Promise<number> {
  await setInterfaceWidth(scope, width);
  return block.evaluate((element) => {
    const tracks = getComputedStyle(element).gridTemplateColumns;
    return tracks === "none" ? 0 : tracks.split(" ").length;
  });
}

const specimen = (scope: Locator, group: string, name: string) => scope.locator(`#${group} [data-specimen="${name}"]`);
const gridIn = (scope: Locator) => scope.locator("[data-slot=ui-grid]").first();

test.describe("on a wide window", () => {
  test.skip(({ isMobile }) => isMobile, "The window is the narrow part on a phone; these checks need a wide window.");

  test("should fit a four-column grid to the interface when the window is wide", async ({ page }) => {
    await page.goto("/dev/components");
    const scope = specimen(page.locator("body"), "Grid", "Four columns");

    expect(await columnsAt(scope, gridIn(scope), widths.narrow)).toBe(1);
    expect(await columnsAt(scope, gridIn(scope), widths.pastTwoColumns)).toBe(2);
    expect(await columnsAt(scope, gridIn(scope), widths.pastFourColumns)).toBe(4);
  });

  test("should fit a three-column grid to the interface when the window is wide", async ({ page }) => {
    await page.goto("/dev/components");
    const scope = specimen(page.locator("body"), "Grid", "Three columns");

    expect(await columnsAt(scope, gridIn(scope), widths.narrow)).toBe(1);
    expect(await columnsAt(scope, gridIn(scope), widths.pastTwoColumns)).toBe(2);
    expect(await columnsAt(scope, gridIn(scope), widths.pastThreeColumns)).toBe(3);
  });

  test("should fit a two-column key-value list to the interface when the window is wide", async ({ page }) => {
    await page.goto("/dev/components");
    const scope = specimen(page.locator("body"), "KeyValue", "Two columns");
    const list = scope.locator("[data-slot=ui-key-value-list]");

    expect(await columnsAt(scope, list, widths.pastTwoColumns)).toBe(1);
    expect(await columnsAt(scope, list, widths.pastThreeColumns)).toBe(2);
  });

  test("should give a card more padding when the interface is wide", async ({ page }) => {
    await page.goto("/dev/components");
    const scope = specimen(page.locator("body"), "Card", "Normal");
    const card = scope.locator(".card-surface");

    await setInterfaceWidth(scope, widths.narrow);
    await expect(card).toHaveCSS("padding-left", "16px");
    await setInterfaceWidth(scope, widths.pastTwoColumns);
    await expect(card).toHaveCSS("padding-left", "20px");
  });

  test("should size a level-1 heading up when the interface is wide", async ({ page }) => {
    await page.goto("/dev/components");
    const scope = specimen(page.locator("body"), "Heading", "Levels");
    const heading = scope.getByRole("heading", { level: 1 });

    await setInterfaceWidth(scope, widths.narrow);
    await expect(heading).toHaveCSS("font-size", "30px");
    await setInterfaceWidth(scope, widths.pastTwoColumns);
    await expect(heading).toHaveCSS("font-size", "36px");
  });

  test("should lay a grid out in columns when the interface is open in the editor", async ({ page }) => {
    await page.goto("/dev/editor?kind=ui");
    const editor = page.locator("[data-slot=ui-block-editor]");
    await expect(editor).toBeVisible();

    expect(await columnsAt(editor, gridIn(editor), widths.pastThreeColumns)).toBe(3);
    expect(await columnsAt(editor, gridIn(editor), widths.narrow)).toBe(1);
  });
});

/*
 * A container has no width of its own (inline-size containment), so a parent
 * that sized the interface by its content would give it none, and every block
 * would take the narrow layout. Each interface on these pages must fill the
 * room its parent gives it.
 */
const interfacePages = ["/dev/components", "/?home", "/docs/json-render/components/grid", "/preview", "/dev/editor?kind=ui", "/dev/workspace"] as const;

/** Narrower than any place we draw an interface: a phone column is about 330px. */
const narrowestInterface = 200;

/** Every interface the page shows (not inside a hidden parent): its width, and the room its parent gives. */
const shownInterfaces = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((node) => getComputedStyle(node).containerName === "ui" && node.checkVisibility())
      .flatMap((root) => {
        const parent = root.parentElement;
        if (!parent) return [];
        const style = getComputedStyle(parent);
        const room = parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return [{ width: Math.round(root.getBoundingClientRect().width), room: Math.round(room), parent: parent.className.slice(0, 80) }];
      }),
  );

for (const path of interfacePages) {
  test(`should stretch every interface to its parent when ${path} opens`, async ({ page }) => {
    await page.goto(path);
    // Wait for interfaces that are shown; hidden ones (a closed tab, the other half of a swap) are not measured.
    await expect.poll(async () => (await shownInterfaces(page)).length).toBeGreaterThan(0);

    const shown = await shownInterfaces(page);
    const collapsed = shown.filter(({ width }) => width < narrowestInterface);
    const unstretched = shown.filter(({ width, room }) => Math.abs(width - room) > 1);

    // A parent that shrinks to fit collapses together with its interface, so equal widths alone prove nothing.
    expect(collapsed, `interfaces narrower than ${String(narrowestInterface)}px`).toEqual([]);
    expect(unstretched, "interfaces narrower or wider than the room their parent gives").toEqual([]);
  });
}
