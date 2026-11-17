import type { Locator, Page } from "@playwright/test";

import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";

/*
 * Every artifact has one home: the shared team it is shared through, else
 * Personal. A workspace lists only the artifacts whose home it is. So
 * sharing with a team is a move: the control says "Move to <team>", the
 * artifact leaves every Personal list and count at once, a toast says where
 * it went (Open in <team>, Undo), and making it private moves it back.
 * On /dev/workspace?scopes=1 (the real workspace, fixture artifacts, no
 * database): Design shares at once, Customer research needs an approval,
 * and Note 6 is already Design's.
 */

const NOTE_2 = "fixtureworkspacenote01";

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Workspace" });
const allCount = (page: Page) => page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: /^All artifacts/ });
/** The list's row for an artifact, by its exact title. */
const row = (page: Page, title: string) => sidebar(page).locator("li").filter({ has: page.locator("[data-slot=artifact-title]").getByText(title, { exact: true }) });
const toastWith = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text });
const editor = (page: Page, title: string) => page.getByRole("region", { name: `Edit ${title}` });

/** Opens the Share dialog of the open artifact. Retried: on a phone the link scrolls the editor into view after load, which can swallow the first click. */
async function openShare(page: Page, title: string): Promise<Locator> {
  await expect(editor(page, title)).toBeVisible();
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    await editor(page, title).getByRole("button", { name: /Share settings$/ }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog;
}

/** Opens Note 2 in Personal, where the viewer is also in shared teams. */
async function openNote2(page: Page) {
  await page.goto(`/dev/workspace?scopes=1&artifact=${NOTE_2}`);
  await expect(editor(page, "Note 2")).toBeVisible();
  // 40 fixture artifacts, less Note 6, whose home is Design.
  await expect(allCount(page)).toContainText("39");
}

/** Picks Team and the team in the open Share dialog. */
async function pickTeam(page: Page, dialog: Locator, team: string) {
  await dialog.getByRole("radiogroup", { name: "Who can read it" }).getByRole("radio", { name: /^Team/ }).click();
  const picker = dialog.getByRole("combobox", { name: "Move to" });
  await picker.click();
  await page.getByRole("option", { name: team, exact: true }).click();
  await expect(picker).toContainText(team);
}

test("should move an artifact out of Personal and into the team's workspace when it is shared with a team, and back when it is made private", async ({ page }) => {
  await openNote2(page);
  const dialog = await openShare(page, "Note 2");
  await pickTeam(page, dialog, "Design");
  // The control, the confirmation, and the button all say it moves, and what it leaves.
  await expect(dialog.getByRole("radio", { name: /^Team/ })).toContainText("It moves to the team's workspace.");
  await expect(dialog.locator("[data-slot=share-outcome]")).toHaveText(
    "It applies as soon as you save. It moves to Design and leaves your personal artifacts. Everyone in Design can edit it directly, with no approval. Sharing by link or in public needs approval from someone who can approve sharing (owners and admins by default).",
  );
  const move = dialog.getByRole("button", { name: "Move to Design" });
  await expect(move).toBeVisible();
  await expectNoAxeViolations(dialog);
  await move.click();

  // It says where it went, and offers the way there and the way back.
  const toast = toastWith(page, "Moved “Note 2” to Design.");
  await expect(toast).toBeVisible();
  await expect(toast.getByRole("button", { name: "Open in Design" })).toBeVisible();
  await expect(toast.getByRole("button", { name: "Undo" })).toBeVisible();
  await expectNoAxeViolations(toast);

  // Gone from every Personal place at once: the list, the count, the open pane, and a search.
  await expect(row(page, "Note 2")).toHaveCount(0);
  await expect(allCount(page)).toContainText("38");
  await expect(editor(page, "Note 2")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search artifacts" }).fill("Note 2");
  await expect(row(page, "Note 20")).toHaveCount(1);
  await expect(row(page, "Note 2")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search artifacts" }).fill("");

  // "Open in Design" is the team's workspace with the artifact open.
  await toast.getByRole("button", { name: "Open in Design" }).click();
  await expect(page).toHaveURL(new RegExp(`/dev/workspace\\?team=fixture-shared-0&artifact=${NOTE_2}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Shared with Design" })).toHaveCount(1);
  await expect(editor(page, "Note 2")).toBeVisible();
  await expect(row(page, "Note 2").getByRole("button").first()).toHaveAttribute("aria-current", "true");
  await expect(row(page, "Note 2").locator("[data-slot=row-workspace]"), "a row at home names no other workspace").toHaveCount(0);

  // Private again is the move back, said the same way.
  const again = await openShare(page, "Note 2");
  await expect(again.getByRole("combobox", { name: "Team" }), "it is in Design now, so nothing moves yet").toContainText("Design");
  await expect(again.getByRole("button", { name: "Save" })).toBeVisible();
  await again.getByRole("radiogroup", { name: "Who can read it" }).getByRole("radio", { name: /^Private/ }).click();
  await expect(again.locator("[data-slot=share-outcome]")).toHaveText("Only you can read it. Any open request is canceled. It moves back to your personal artifacts and leaves Design.");
  await again.getByRole("button", { name: "Move to Personal" }).click();

  const back = toastWith(page, "Moved “Note 2” back to Personal.");
  await expect(back).toBeVisible();
  await expect(row(page, "Note 2"), "it leaves the team's list at once").toHaveCount(0);
  await back.getByRole("button", { name: "Open in Personal" }).click();
  await expect(page).toHaveURL(new RegExp(`/dev/workspace\\?artifact=${NOTE_2}$`));
  await expect(editor(page, "Note 2")).toBeVisible();
  await expect(row(page, "Note 2")).toHaveCount(1);
  await expect(allCount(page)).toContainText("39");
});

test("should bring a moved artifact back, open, when Undo is pressed from the keyboard", async ({ page }) => {
  await openNote2(page);
  const dialog = await openShare(page, "Note 2");
  await pickTeam(page, dialog, "Design");
  await dialog.getByRole("button", { name: "Move to Design" }).click();
  const toast = toastWith(page, "Moved “Note 2” to Design.");
  await expect(row(page, "Note 2")).toHaveCount(0);

  // Both actions are buttons a keyboard reaches.
  await toast.getByRole("button", { name: "Open in Design" }).focus();
  await expect(toast.getByRole("button", { name: "Open in Design" })).toBeFocused();
  await toast.getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("Enter");

  await expect(toastWith(page, "“Note 2” is back in your personal artifacts.")).toBeVisible();
  await expect(row(page, "Note 2").getByRole("button").first()).toHaveAttribute("aria-current", "true");
  await expect(allCount(page)).toContainText("39");
  await expect(editor(page, "Note 2")).toBeVisible();
  // The pane shows it as it is again: private, with nothing waiting.
  await expect(editor(page, "Note 2").getByRole("button", { name: "Share settings" })).toHaveAttribute("title", "Who can read it: Private");
  await expect(page).toHaveURL(new RegExp(`artifact=${NOTE_2}$`));
});

test("should only ask, move nothing, and offer no Undo when the team's sharing needs an approval", async ({ page }) => {
  await openNote2(page);
  const dialog = await openShare(page, "Note 2");
  await pickTeam(page, dialog, "Customer research");
  await expect(dialog.locator("[data-slot=share-outcome]")).toContainText(
    "Someone in Customer research who approves sharing approves it first. Until then, it stays as it is. Once approved, it moves to Customer research and leaves your personal artifacts.",
  );
  await expect(dialog.getByRole("button", { name: "Move to Customer research", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Ask to move to Customer research" }).click();

  await expect(toastWith(page, "Request sent. An owner or admin will review it.")).toBeVisible();
  await expect(page.locator("[data-sonner-toast]").getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]").getByRole("button", { name: /^Open in/ })).toHaveCount(0);
  // It stays where it is until someone approves.
  await expect(row(page, "Note 2")).toHaveCount(1);
  await expect(row(page, "Note 2")).toContainText("Waiting for approval");
  await expect(allCount(page)).toContainText("39");
  await expect(editor(page, "Note 2")).toBeVisible();
});

test("should keep an artifact in Personal when a link is approved by the personal team, and say it moves when a shared team approves it", async ({ page }) => {
  await openNote2(page);
  const dialog = await openShare(page, "Note 2");
  await dialog.getByRole("radiogroup", { name: "Who can read it" }).getByRole("radio", { name: /^Link/ }).click();
  const approver = dialog.getByRole("combobox", { name: "Approved by" });
  await expect(approver).toContainText("Fixture (personal)");
  await expect(dialog.locator("[data-slot=share-outcome]")).toHaveText("It applies as soon as you save.");
  await expect(dialog.getByRole("button", { name: "Save" }), "sharing by link keeps the word share: nothing moves").toBeVisible();

  // A shared team as the approver makes that team its home, once approved.
  await approver.click();
  await page.getByRole("option", { name: "Design", exact: true }).click();
  await expect(dialog.locator("[data-slot=share-outcome]")).toContainText("Once approved, it moves to Design and leaves your personal artifacts.");
  await expect(dialog.getByRole("button", { name: "Ask to move to Design" })).toBeVisible();

  await approver.click();
  await page.getByRole("option", { name: "Fixture (personal)" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(toastWith(page, "Sharing saved.")).toBeVisible();
  await expect(row(page, "Note 2")).toHaveCount(1);
  await expect(allCount(page)).toContainText("39");
});

test("should list a team's artifact only in the team's workspace, and name the team on its row when a link opens it in Personal", async ({ page }) => {
  // Note 6 is the viewer's own, shared with Design: Personal does not list it.
  await page.goto("/dev/workspace?scopes=1");
  await expect(allCount(page)).toContainText("39");
  await expect(row(page, "Note 5")).toHaveCount(1);
  await expect(row(page, "Note 6")).toHaveCount(0);

  // A link still opens it here; its row says where it lives, and the count stays Personal's.
  await page.goto("/dev/workspace?scopes=1&artifact=fixtureworkspacenote05");
  await expect(editor(page, "Note 6")).toBeVisible();
  await expect(row(page, "Note 6").locator("[data-slot=row-workspace]")).toHaveText("In Design");
  await expect(allCount(page)).toContainText("39");
  // Scanned once the page answers a click: a scan marks the row, and a mark made before hydration reads as a mismatch.
  const dialog = await openShare(page, "Note 6");
  await expect(dialog.getByRole("combobox", { name: "Team" })).toContainText("Design");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expectNoAxeViolations(row(page, "Note 6"));

  // In Design's workspace it is at home.
  await page.goto("/dev/workspace?scopes=1&team=fixture-shared-0");
  await expect(row(page, "Note 6")).toHaveCount(1);
  await expect(row(page, "Note 6").locator("[data-slot=row-workspace]")).toHaveCount(0);
  await page.goto("/dev/workspace?scopes=1&team=fixture-shared-2");
  await expect(row(page, "Note 5")).toHaveCount(1);
  await expect(row(page, "Note 6"), "another team's workspace does not list it").toHaveCount(0);
});
