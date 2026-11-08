import { expect, test } from "@playwright/test";

test("should keep the start-a-team destination when the person switches between sign up and sign in", async ({ page }) => {
  await page.goto("/sign-up?next=%2Fteams%2Fnew");
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fteams%2Fnew$/);

  await page.getByRole("link", { name: "Create one" }).click();
  await expect(page).toHaveURL(/\/sign-up\?next=%2Fteams%2Fnew$/);
});

test("should drop an off-site destination from the switch link when next points to another origin", async ({ page }) => {
  await page.goto("/sign-up?next=https%3A%2F%2Fevil.example");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/sign-in");

  await page.goto("/sign-in?next=%2F%2Fevil.example");
  await expect(page.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/sign-up");
});
