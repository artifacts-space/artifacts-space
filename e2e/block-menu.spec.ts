import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * Block handles and the block menu on a Markdown artifact page, on the dev
 * fixture (/dev/block-menu, src/components/dev/block-menu-fixture.tsx): the
 * real page editor, with the Markdown it would save shown under it. As a
 * reader (?as=reader), the read view, where a right-click offers only Copy
 * link to block.
 */

const editor = (page: Page) => page.getByRole("textbox", { name: "Artifact content" });
const savedMarkdown = (page: Page) => page.getByTestId("fixture-markdown");
const menu = (page: Page) => page.locator("[data-slot=block-menu]");
const grips = (page: Page) => page.getByRole("button", { name: "Block actions" });

async function openFixture(page: Page, path = "/dev/block-menu") {
  await page.goto(path);
  await expect(editor(page).getByRole("heading", { name: "Four items waiting for you" })).toBeVisible();
}

/** The block in the document whose text is `text`: a paragraph, heading, quote, or list item. */
function block(page: Page, text: string): Locator {
  return editor(page).locator(":scope > *, li").filter({ hasText: text }).last();
}

/** The grip beside a block: hovered into view with a mouse, always shown on touch. */
async function gripFor(page: Page, text: string, isMobile: boolean): Promise<Locator> {
  const target = block(page, text);
  await target.scrollIntoViewIfNeeded();
  if (!isMobile) {
    await target.hover({ position: { x: 8, y: 6 } });
    await expect(grips(page)).toHaveCount(1);
    return grips(page);
  }
  const box = await target.boundingBox();
  if (!box) throw new Error(`No box for ${text}`);
  const all = await grips(page).all();
  const distances = await Promise.all(all.map(async (grip) => {
    const gripBox = await grip.boundingBox();
    return gripBox ? Math.abs(gripBox.y + gripBox.height / 2 - (box.y + 12)) : Infinity;
  }));
  const nearest = all[distances.indexOf(Math.min(...distances))];
  if (!nearest) throw new Error(`No grip for ${text}`);
  return nearest;
}

/**
 * Puts the cursor in a block and waits until the editor has seen it: keys
 * sent faster than the browser reports the new selection would act on the
 * block where the cursor was before (as in editor-media.spec.ts).
 */
async function cursorIn(page: Page, text: string) {
  await expect(async () => {
    await block(page, text).click();
    const seen = await page.evaluate(() => new Promise<string>((resolve) => {
      requestAnimationFrame(() => { setTimeout(() => { resolve(window.getSelection()?.anchorNode?.textContent ?? ""); }, 0); });
    }));
    expect(seen).toContain(text);
  }).toPass({ timeout: 10_000 });
}

async function openMenu(page: Page, text: string, isMobile: boolean) {
  const grip = await gripFor(page, text, isMobile);
  await grip.click();
  await expect(menu(page)).toBeVisible();
  return grip;
}

/** Chooses a row: by tapping on phones (through Change for "Change to …"), by searching and Enter with a keyboard. */
async function choose(page: Page, row: string, isMobile: boolean) {
  const type = /^Change to (.+)$/.exec(row)?.[1];
  if (!isMobile) {
    await page.keyboard.type(row);
    await page.keyboard.press("Enter");
  } else if (type) {
    await menu(page).getByRole("menuitem", { name: "Change" }).click();
    await page.locator("[data-slot=block-menu-change]").getByRole("menuitemradio", { name: type }).click();
  } else {
    await menu(page).getByRole("menuitem", { name: row }).click();
  }
  await expect(menu(page)).toBeHidden();
}

test("should open the block menu from the grip with no row highlighted", async ({ page, isMobile }) => {
  await openFixture(page);
  await openMenu(page, "Written November 11", isMobile);
  await expect(menu(page).getByRole("menu", { name: "Text block" })).toBeVisible();
  await expect(menu(page).locator("[data-highlighted]")).toHaveCount(0);
  await expect(menu(page).getByPlaceholder("Search actions…")).toBeVisible();
  for (const name of ["Change", "Copy link to block", "Duplicate", "Move up", "Move down", "Delete", "Comment"]) {
    await expect(menu(page).getByRole("menuitem", { name })).toBeVisible();
  }
  await expect(menu(page)).toContainText("Last edited");
  await expect(menu(page)).toContainText("@charles");
  await expect(menu(page)).toContainText("14 words, 83 characters");
  if (!isMobile) await expect(menu(page).getByPlaceholder("Search actions…")).toBeFocused();
  else {
    // On a phone the menu is a sheet along the bottom, with 44px rows.
    const viewport = page.viewportSize();
    await expect.poll(async () => {
      const sheet = await menu(page).boundingBox();
      return sheet ? Math.round(sheet.y + sheet.height) : 0;
    }).toBe(viewport?.height);
    // Measured while the sheet may still be sliding in, so rounded.
    await expect.poll(async () => Math.round((await menu(page).getByRole("menuitem", { name: "Duplicate" }).boundingBox())?.height ?? 0)).toBe(44);
  }
});

test("should open the block menu with a right-click on a block", async ({ page, isMobile }) => {
  test.skip(isMobile, "Touch screens keep the browser's own long-press menu.");
  await openFixture(page);
  await block(page, "Closing paragraph").click({ button: "right" });
  await expect(menu(page).getByRole("menu", { name: "Text block" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
});

test("should change a block's type from Change", async ({ page, isMobile }) => {
  await openFixture(page);
  await openMenu(page, "Closing paragraph", isMobile);
  if (isMobile) {
    await menu(page).getByRole("menuitem", { name: "Change" }).click();
    const change = page.locator("[data-slot=block-menu-change]");
    await expect(change.getByRole("menuitemradio", { name: "Text" })).toHaveAttribute("aria-checked", "true");
    await change.getByRole("menuitemradio", { name: "Heading 2" }).click();
  } else {
    await choose(page, "heading 2", isMobile);
  }
  await expect(savedMarkdown(page)).toContainText("## Closing paragraph of the fixture.");
  await openMenu(page, "Frenchman", isMobile);
  await choose(page, "Change to Numbered list", isMobile);
  await expect(savedMarkdown(page)).toContainText("1. Frenchman's Cove goes first\n2. Then Sunset Pointe");
});

test("should duplicate, move, and delete a block, and undo the delete", async ({ page, isMobile }) => {
  await openFixture(page);
  await openMenu(page, "Then Sunset Pointe", isMobile);
  await choose(page, "Duplicate", isMobile);
  await expect(savedMarkdown(page)).toContainText("- Then Sunset Pointe\n- Then Sunset Pointe");

  await openMenu(page, "Frenchman", isMobile);
  await choose(page, "Move down", isMobile);
  await expect(savedMarkdown(page)).toContainText("- Then Sunset Pointe\n- Frenchman's Cove goes first\n- Then Sunset Pointe");

  await openMenu(page, "A person's lock", isMobile);
  await choose(page, "Delete", isMobile);
  await expect(savedMarkdown(page)).not.toContainText("A person's lock");
  await page.locator("[data-sonner-toast]").getByRole("button", { name: "Undo" }).click();
  await expect(savedMarkdown(page)).toContainText("> A person's lock beats a supplier close.");
});

test("should run block shortcuts with the cursor in a block", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones have no hardware keyboard.");
  await openFixture(page);
  await cursorIn(page, "Closing paragraph");
  await page.keyboard.press("Alt+Shift+ArrowUp");
  await expect(savedMarkdown(page)).toContainText("Closing paragraph of the fixture.\n\n> A person's lock");
  await page.keyboard.press("ControlOrMeta+d");
  await expect(savedMarkdown(page)).toContainText("Closing paragraph of the fixture.\n\nClosing paragraph of the fixture.");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(savedMarkdown(page)).not.toContainText("Closing paragraph of the fixture.\n\nClosing paragraph of the fixture.");
});

test("should move through the menu with the keyboard and return focus to the grip on Escape", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones have no hardware keyboard.");
  await openFixture(page);
  const grip = await openMenu(page, "Rate plan writes", false);
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("menuitem", { name: "Change" })).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("ArrowRight");
  const change = page.locator("[data-slot=block-menu-change]");
  await expect(change.getByRole("menuitemradio", { name: "Heading 2" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(change).toBeHidden();
  await expect(menu(page).getByPlaceholder("Search actions…")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  await expect(grip).toBeFocused();
});

test("should drag a block to a new place by its grip", async ({ page, isMobile }) => {
  test.skip(isMobile, "Touch screens move blocks with Move up and Move down.");
  await openFixture(page);
  const grip = await gripFor(page, "Closing paragraph", false);
  await grip.dragTo(block(page, "Rate plan writes"), { targetPosition: { x: 20, y: 2 } });
  await expect(savedMarkdown(page)).toContainText("Closing paragraph of the fixture.\n\n## Rate plan writes");
});

test("should add a line under a block with + and offer blocks for it", async ({ page, isMobile }) => {
  test.skip(isMobile, "Touch screens show only the grip; the toolbar inserts blocks.");
  await openFixture(page);
  await block(page, "Rate plan writes").hover({ position: { x: 8, y: 6 } });
  await page.getByRole("button", { name: "Add a line below" }).click();
  await expect(page.getByRole("listbox", { name: "Insert a block" })).toBeVisible();
  // The slash menu filters by what follows "/", without spaces.
  await page.keyboard.type("h3");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Fresh heading");
  await expect(savedMarkdown(page)).toContainText("## Rate plan writes\n\n### Fresh heading\n\n- Frenchman");
});

test("should quote the block in a new comment from Comment", async ({ page, isMobile }) => {
  await openFixture(page);
  await openMenu(page, "A person's lock", isMobile);
  await choose(page, "Comment", isMobile);
  await expect(page.getByTestId("fixture-comment")).toContainText("> A person's lock beats a supplier close.");
  await expect(page.getByTestId("fixture-comment")).toContainText("[Go to this block](http");
});

test("should copy a link that opens the artifact at the block, highlighted", async ({ page, context, isMobile }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openFixture(page);
  await openMenu(page, "A person's lock", isMobile);
  await choose(page, "Copy link to block", isMobile);
  await expect(page.getByText("Link to block copied")).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("/artifact/blockmenufixture000001#block=A%20person's%20lock%20beats%20a:~:text=");

  await page.goto(`/dev/block-menu?as=reader${new URL(link).hash}`);
  const flash = page.locator("[data-block-flash]");
  await expect(flash).toHaveCount(1);
  const quote = page.locator(".artifact-prose blockquote");
  await expect(quote).toBeInViewport();
  const [flashBox, quoteBox] = await Promise.all([flash.boundingBox(), quote.boundingBox()]);
  expect(Math.abs((flashBox?.y ?? 0) - (quoteBox?.y ?? 0))).toBeLessThan(12);
});

test("should give readers only Copy link to block, and no handles", async ({ page, isMobile }) => {
  await page.goto("/dev/block-menu?as=reader");
  await expect(page.locator(".artifact-prose").getByRole("heading", { name: "Four items waiting for you" })).toBeVisible();
  await expect(grips(page)).toHaveCount(0);
  // Touch screens keep the browser's own long-press menu.
  if (isMobile) return;
  await page.locator(".artifact-prose p").first().click({ button: "right" });
  const items = page.getByRole("menuitem");
  await expect(items).toHaveCount(1);
  await expect(items).toHaveText("Copy link to block");
});

test("should color a block's text from Color, and write it into the Markdown", async ({ page, isMobile }) => {
  await openFixture(page);
  await openMenu(page, "Closing paragraph", isMobile);
  if (isMobile) {
    await menu(page).getByRole("menuitem", { name: "Color" }).click();
    await page.locator("[data-slot=block-menu-color]").getByRole("group", { name: "Text color" }).getByRole("menuitemradio", { name: "Blue text" }).click();
  } else {
    await page.keyboard.type("blue text");
    await page.keyboard.press("Enter");
  }
  await expect(menu(page)).toBeHidden();
  await expect(savedMarkdown(page)).toContainText("Closing paragraph of the fixture. <!-- color: blue -->");
  await expect(editor(page).locator('p[data-block-color="blue"]')).toHaveText("Closing paragraph of the fixture.");
});

test("should check the current colors in Color and set a background back to Default", async ({ page, isMobile }) => {
  await openFixture(page);
  await expect(editor(page).locator('p[data-block-background="yellow"]')).toContainText("Written November 11");
  await openMenu(page, "Written November 11", isMobile);
  await menu(page).getByRole("menuitem", { name: "Color" }).click();
  const color = page.locator("[data-slot=block-menu-color]");
  const background = color.getByRole("group", { name: "Background" });
  await expect(background.getByRole("menuitemradio", { name: "Yellow background" })).toHaveAttribute("aria-checked", "true");
  await expect(color.getByRole("menuitemradio", { name: "Default text" })).toHaveAttribute("aria-checked", "true");
  await background.getByRole("menuitemradio", { name: "Default background" }).click();
  await expect(savedMarkdown(page)).toContainText("Write your answer under each item.\n\n## Rate plan writes");
  await expect(editor(page).locator("p[data-block-background]")).toHaveCount(0);
});

test("should open Color with the keyboard and put focus on the current choice", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones have no hardware keyboard.");
  await openFixture(page);
  await openMenu(page, "Written November 11", false);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("menuitem", { name: "Color" })).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("ArrowRight");
  const color = page.locator("[data-slot=block-menu-color]");
  await expect(color.getByRole("menuitemradio", { name: "Default text" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(color).toBeHidden();
});

test("should show block colors in the read view", async ({ page }) => {
  await page.goto("/dev/block-menu?as=reader");
  const line = page.locator('.artifact-prose p[data-block-background="yellow"]');
  await expect(line).toContainText("Write your answer under each item.");
  await expect(line).not.toContainText("background");
  const fill = await line.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(fill).not.toBe("rgba(0, 0, 0, 0)");
});

test("should draw a quote with a background in the body text color, so it stays readable", async ({ page, isMobile }) => {
  await openFixture(page);
  await openMenu(page, "A person's lock", isMobile);
  if (isMobile) {
    await menu(page).getByRole("menuitem", { name: "Color" }).click();
    await page.locator("[data-slot=block-menu-color]").getByRole("menuitemradio", { name: "Green background" }).click();
  } else {
    await page.keyboard.type("green background");
    await page.keyboard.press("Enter");
  }
  await expect(savedMarkdown(page)).toContainText("> A person's lock beats a supplier close. <!-- background: green -->");
  const quoted = editor(page).locator('blockquote p[data-block-background="green"]');
  const plain = block(page, "Closing paragraph");
  const [quoteInk, bodyInk] = await Promise.all([quoted.evaluate((element) => getComputedStyle(element).color), plain.evaluate((element) => getComputedStyle(element).color)]);
  expect(quoteInk).toBe(bodyInk);
});
