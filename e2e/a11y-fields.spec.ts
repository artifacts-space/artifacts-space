import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * Text fields and the pieces a form screen is drawn with (Input, Textarea,
 * Avatar, and the screen props of Button, Badge, List, Select, and Image):
 * axe on their gallery groups and on a composed sign-in screen, typing that
 * only changes the page, and a password field that is drawn and cannot be
 * typed into, focused, or filled by a password manager.
 */

const specimen = (page: Page, group: string, name: string) => page.locator(`section#${group} [data-specimen="${name}"]`);

/**
 * The gallery is ready once React has hydrated it, which its ready mark
 * says. The server's HTML is on screen, and its fields editable, before
 * that: a scan writes a marker on what it scans, and a marker written on
 * HTML React has yet to check is a hydration mismatch.
 */
async function galleryReady(page: Page) {
  await page.goto("/dev/components#Input");
  await expect(page.locator("section#Input")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-gallery-ready]")).toBeAttached({ timeout: 60_000 });
}

test("should pass axe on the Input, Textarea, Avatar, Button, Badge, List, Select, and Image groups of the gallery", async ({ page }) => {
  await galleryReady(page);
  for (const group of ["Input", "Textarea", "Avatar", "Button", "Badge", "List", "Select", "Image"]) {
    const section = page.locator(`section#${group}`);
    await section.scrollIntoViewIfNeeded();
    await expectNoAxeViolations(section);
  }
});

test("should pass axe on the sign-in screen and mirror what is typed in the email field on the page only", async ({ page }) => {
  await galleryReady(page);
  const screen = specimen(page, "specs", "Sign-in screen");
  await screen.scrollIntoViewIfNeeded();
  await expectNoAxeViolations(screen);
  const sent: string[] = [];
  page.on("request", (request) => { if (request.method() !== "GET") sent.push(request.url()); });
  await screen.getByRole("textbox", { name: "Email" }).fill("maya@example.com");
  await expect(screen.getByText("Signing in as maya@example.com")).toBeVisible();
  await expectNoAxeViolations(screen);
  // Typing changed the page and nothing else: no request carried it anywhere.
  expect(sent).toEqual([]);
});

test("should draw the password field as a stand-in that takes no focus and no typing", async ({ page, isMobile }) => {
  await galleryReady(page);
  const screen = specimen(page, "specs", "Sign-in screen");
  await screen.scrollIntoViewIfNeeded();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(screen.locator("form")).toHaveCount(0);
  const standIn = screen.locator("[data-password-stand-in]");
  await expect(standIn).toBeVisible();
  await expect(standIn).toHaveAttribute("role", "img");
  await expect(standIn).toHaveAccessibleName("Password");
  // Clicking it and typing puts the text nowhere on the page.
  await standIn.click();
  expect(await standIn.evaluate((element) => document.activeElement === element || element.contains(document.activeElement))).toBe(false);
  await page.keyboard.type("hunter2");
  await expect(screen.getByText("hunter2")).toHaveCount(0);
  expect(await screen.locator("input, textarea").evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value))).toEqual([""]);
  // The keyboard goes from the email field straight to the button. A phone has no Tab key.
  if (isMobile) return;
  await screen.getByRole("textbox", { name: "Email" }).focus();
  await page.keyboard.press("Tab");
  await expect(screen.getByRole("button", { name: "Sign in" })).toBeFocused();
});

test("should show a Textarea at least as tall as its rows, and let it grow with what is typed", async ({ page }) => {
  await galleryReady(page);
  const height = (name: string) => specimen(page, "Textarea", name).getByRole("textbox").evaluate((element) => element.getBoundingClientRect().height);
  const two = await height("Two rows");
  const four = await height("Normal");
  const six = await height("Six rows");
  expect(four).toBeGreaterThan(two + 20);
  expect(six).toBeGreaterThan(four + 20);
  // Six rows are three times the lines of two, over the same padding.
  const line = (six - two) / 4;
  expect(line).toBeGreaterThan(14);
  expect(Math.abs(four - (two + 2 * line))).toBeLessThan(2);
  // The height is the rows' lines plus the field's own padding and border, whatever those are set to.
  const box = await specimen(page, "Textarea", "Six rows").getByRole("textbox").evaluate((element) => {
    const style = getComputedStyle(element);
    const px = (name: string) => Number.parseFloat(style.getPropertyValue(name));
    return { line: px("line-height"), around: px("padding-top") + px("padding-bottom") + px("border-top-width") + px("border-bottom-width") };
  });
  expect(Math.abs(six - (6 * box.line + box.around))).toBeLessThan(1);
  expect(Math.abs(line - box.line)).toBeLessThan(1);
  const short = specimen(page, "Textarea", "Two rows").getByRole("textbox");
  await short.fill("one\ntwo\nthree\nfour\nfive");
  expect(await height("Two rows")).toBeGreaterThan(two + 2 * line);
});

test("should name the password stand-in once, describe it, and show it disabled", async ({ page }) => {
  await galleryReady(page);
  const plain = specimen(page, "Input", "Password stand-in");
  await plain.scrollIntoViewIfNeeded();
  const standIn = plain.locator("[data-password-stand-in]");
  await expect(standIn).toHaveAccessibleName("Password");
  await expect(standIn).toHaveAccessibleDescription("A password field in a mockup. It cannot be typed into. At least 12 characters.");
  // The label is the image's name, not a second line of text before it.
  await expect(standIn.locator("xpath=..")).toMatchAriaSnapshot(`
    - img "Password"
    - paragraph: At least 12 characters.
  `);
  const disabled = specimen(page, "Input", "Password stand-in, disabled").locator("[data-password-stand-in]");
  await expect(disabled).toHaveAccessibleName("Current password");
  // An image has no disabled state to set, so its description says it.
  await expect(disabled).toHaveAccessibleDescription("A disabled password field in a mockup. It cannot be typed into.");
  const opacity = (target: typeof disabled) => target.evaluate((element) => Number(getComputedStyle(element).opacity));
  expect(await opacity(disabled)).toBeLessThan(1);
  expect(await opacity(standIn)).toBe(1);
  // The same dimming as a disabled text field beside it.
  expect(await opacity(disabled)).toBe(await opacity(specimen(page, "Input", "Disabled").getByRole("textbox")));
});

test("should mark every text field in the gallery so browsers and password managers skip it", async ({ page }) => {
  await galleryReady(page);
  const fields = await page.locator("section#Input input, section#Textarea textarea, section#specs [data-specimen='Sign-in screen'] input").evaluateAll((elements) =>
    elements.map((element) => ({
      autocomplete: element.getAttribute("autocomplete"),
      name: element.getAttribute("name"),
      onePassword: element.hasAttribute("data-1p-ignore"),
      lastPass: element.getAttribute("data-lpignore"),
      bitwarden: element.hasAttribute("data-bwignore"),
      formType: element.getAttribute("data-form-type"),
      inForm: element.closest("form") !== null,
      type: element.getAttribute("type"),
    })),
  );
  expect(fields.length).toBeGreaterThanOrEqual(10);
  for (const field of fields) {
    expect(field).toMatchObject({ autocomplete: "off", name: null, onePassword: true, lastPass: "true", bitwarden: true, formType: "other", inForm: false });
    expect(field.type).not.toBe("password");
  }
});

for (const slug of ["input", "textarea", "avatar"]) {
  test(`should pass axe on the ${slug} docs page, with its live examples drawn`, async ({ page }) => {
    await page.goto(`/docs/json-render/components/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(`^${slug}$`, "i"));
    await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
    await expect(page.getByText("could not be shown")).toHaveCount(0);
    // The props table scrolls sideways on a phone and becomes a tab stop once it has measured itself, which needs the page interactive.
    await expect(async () => {
      await expectNoAxeViolations(page, {
        skip: {
          "scrollable-region-focusable": {
            on: "details:not([open]) pre",
            reason: "the JSON under a closed Show JSON toggle is not drawn until it opens, so it cannot measure itself yet; every component page has it",
          },
        },
      });
    }).toPass({ timeout: 20_000 });
  });
}
