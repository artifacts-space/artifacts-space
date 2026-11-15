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

/** The gallery is interactive once a bound field answers typing; the sign-in screen is the last thing these tests use. */
async function galleryReady(page: Page) {
  await page.goto("/dev/components#Input");
  await expect(page.locator("section#Input")).toBeVisible({ timeout: 30_000 });
  await expect(specimen(page, "specs", "Sign-in screen").getByRole("textbox", { name: "Email" })).toBeEditable({ timeout: 30_000 });
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
  await expect(standIn).toHaveAccessibleName(/Password: a password field in a mockup/);
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
