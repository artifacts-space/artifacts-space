import { expect, test, type Page } from "@playwright/test";

/*
 * The Share dialog's "Show in search engines" switch, and the team's rule in
 * its outcome line, on /dev/workspace (the real workspace with fixture
 * artifacts and no database). Nothing is saved: the tests only check what the
 * person sees before they press Save.
 */

async function openShareDialog(page: Page) {
  await page.goto("/dev/workspace");
  await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
  await page.getByRole("button", { name: "Share settings" }).click();
  return page.getByRole("dialog");
}

test("should offer search engines only under Public, off by default", async ({ page }) => {
  const dialog = await openShareDialog(page);
  const readers = dialog.getByRole("radiogroup", { name: "Who can read it" });
  const searchSwitch = dialog.getByRole("switch", { name: "Show in search engines" });

  await expect(searchSwitch).toHaveCount(0);
  await readers.getByRole("radio", { name: /Link/ }).click();
  await expect(searchSwitch).toHaveCount(0);

  await readers.getByRole("radio", { name: /Public/ }).click();
  await expect(searchSwitch).toBeVisible();
  await expect(searchSwitch).not.toBeChecked();
  await expect(dialog.getByText("When on, Google and other search engines can list this page.")).toBeVisible();

  await searchSwitch.click();
  await expect(searchSwitch).toBeChecked();

  await readers.getByRole("radio", { name: /Team/ }).click();
  await expect(searchSwitch).toHaveCount(0);
});

/**
 * Opens the Share dialog of the artifact a link opens. Retried: on a phone
 * the link scrolls the editor into view after load, which can swallow the
 * first click.
 */
async function openLinkedShare(page: Page, publicId: string, title: string) {
  await page.goto(`/dev/workspace?scopes=1&artifact=${publicId}`);
  const editor = page.getByRole("region", { name: `Edit ${title}` });
  await expect(editor).toBeVisible();
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    await editor.getByRole("button", { name: "Share settings" }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog;
}

/** Under `?scopes=1`, Note 6 is the viewer's artifact shared with Design, where the viewer is a member and sharing with the team needs no approval. */
function openTeamArtifactShare(page: Page) {
  return openLinkedShare(page, "fixtureworkspacenote05", "Note 6");
}

test("should state the team's rule in the outcome line when the artifact is shared with a team", async ({ page }) => {
  const dialog = await openTeamArtifactShare(page);
  const outcome = dialog.locator("[data-slot=share-outcome]");
  await expect(dialog.getByRole("radiogroup", { name: "Who can read it" }).getByRole("radio", { name: /Team/ })).toHaveAttribute("aria-checked", "true");
  await expect(outcome).toHaveText(
    "It applies as soon as you save. Everyone in Design can edit it directly, with no approval. Sharing by link or in public needs approval from someone who can approve sharing (owners and admins by default).",
  );

  // Asking for a link in the team: the approval is said once, then the team's rule and that edits wait.
  await dialog.getByRole("radiogroup", { name: "Who can read it" }).getByRole("radio", { name: /Link/ }).click();
  await expect(outcome).toHaveText(
    "Someone in Design who approves sharing approves it first. Until then, it stays as it is. Everyone in Design can edit it directly, with no approval. Your edits reach readers outside the team once approved.",
  );

  // Making it private leaves the team, so the rule goes.
  await dialog.getByRole("radiogroup", { name: "Who can read it" }).getByRole("radio", { name: /Private/ }).click();
  await expect(outcome).toHaveText("Only you can read it. Any open request is canceled.");
});

test("should state the team's rule when a personal artifact moves into a shared team, and none while it stays personal", async ({ page }) => {
  const dialog = await openLinkedShare(page, "fixtureworkspacenote04", "Note 5");
  const readers = dialog.getByRole("radiogroup", { name: "Who can read it" });
  const outcome = dialog.locator("[data-slot=share-outcome]");
  // Private: it stays personal, so no team rule.
  await expect(outcome).toHaveText("Only you can read it. Any open request is canceled.");

  // Moving it into Design is the moment the person decides, so the rule shows.
  await readers.getByRole("radio", { name: /Team/ }).click();
  await expect(dialog.getByRole("combobox", { name: "Share with" })).toContainText("Design");
  await expect(outcome).toHaveText(
    "It applies as soon as you save. Everyone in Design can edit it directly, with no approval. Sharing by link or in public needs approval from someone who can approve sharing (owners and admins by default).",
  );

  // A link through Design keeps Design's rule after what saving will do.
  await readers.getByRole("radio", { name: /Link/ }).click();
  const approver = dialog.getByRole("combobox", { name: "Approved by" });
  await expect(approver).toContainText("Design");
  await expect(outcome).toContainText("Someone in Design who approves sharing approves it first.");
  await expect(outcome).toContainText("Everyone in Design can edit it directly, with no approval.");

  // A link approved by the personal team keeps it personal: no team rule.
  await approver.click();
  await page.getByRole("option", { name: "Fixture (personal)" }).click();
  await expect(approver).toContainText("Fixture (personal)");
  await expect(outcome).toHaveText("It applies as soon as you save.");
});
