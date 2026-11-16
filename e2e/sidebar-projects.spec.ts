import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

/**
 * The project tree in the workspace sidebar, on /dev/workspace: the real
 * workspace with projects kept in memory. "Design" holds two artifacts and
 * "Research" one. Acme's project "Launch" holds "Note 30", which the viewer
 * shared with Acme; Acme's project "Handbook" holds nothing of the viewer's,
 * so their own list never shows it. "Locked note" refuses every move, as an
 * artifact the viewer cannot edit would. Everything else is Unfiled.
 */

const projects = (page: Page) => page.getByRole("region", { name: "Projects" });
const entryName = (name: string) => new RegExp(`^${name}, \\d+ artifacts?$`);
const entry = (page: Page, name: string) => projects(page).getByRole("button", { name: entryName(name) });
/** A team's project in the viewer's own list: its row names the team it is shared with. */
const teamEntryName = (name: string, team: string) => new RegExp(`^${name}, shared with ${team}, \\d+ artifacts?$`);
const teamEntry = (page: Page, name: string, team: string) => projects(page).getByRole("button", { name: teamEntryName(name, team) });
/** A group's row: the drop target, holding the disclosure, the name, and the menu. */
const entryRow = (page: Page, name: string, label = entryName(name)) => projects(page).locator("[data-slot=project-row]").filter({ has: page.getByRole("button", { name: label }) });
const group = (page: Page, name: string) => projects(page).getByRole("group", { name, exact: true });
const card = (page: Page, title: string) =>
  page.locator("[data-slot=artifact-list] li").filter({ has: page.getByText(title, { exact: true }) });

/** Checks which group of the tree an artifact sits under. */
async function expectIn(page: Page, title: string, groupName: string) {
  await expect(group(page, groupName).getByText(title, { exact: true })).toBeVisible();
}

async function openWorkspace(page: Page, path = "/dev/workspace") {
  await page.goto(path);
  await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
}

/** Drags a card onto a sidebar row with real mouse moves, so the drop highlight can be checked midway. */
async function dragCard(page: Page, item: Locator, target: Locator, check?: () => Promise<void>) {
  await item.hover();
  await page.mouse.down();
  const box = await target.boundingBox();
  if (!box) throw new Error("The drop target is not on screen.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  if (check) await check();
  await page.mouse.up();
}

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "phones move artifacts from the row menu");

  test("should list projects with counts and their artifacts, Unfiled last, and filter the list when a name is clicked", async ({ page }) => {
    await openWorkspace(page);
    await expect(entry(page, "Design")).toHaveText(/Design\s*2/);
    await expect(entry(page, "Research")).toHaveText(/Research\s*1/);
    await expect(teamEntry(page, "Launch", "Acme")).toHaveText(/Launch\s*Acme\s*1/);
    await expect(entry(page, "Unfiled")).toBeVisible();
    await expect(group(page, "Design").locator("li")).toHaveCount(2);
    await expectIn(page, "Long csv fixture", "Research");
    const names = await projects(page).getByRole("group").evaluateAll((groups) => groups.map((item) => item.getAttribute("aria-label")));
    expect(names.at(-1), "Unfiled is the last group").toBe("Unfiled");

    await entry(page, "Design").click();
    await expect(page).toHaveURL(/\/dev\/workspace\?project=design$/);
    await expect(page.locator("[data-slot=artifact-list] li")).toHaveCount(2);
    await expect(entry(page, "Design")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.getByRole("combobox", { name: "Filter by project" })).toHaveText(/Design/);
    await page.keyboard.press("Escape");

    // Clicking the chosen project again shows every artifact.
    await entry(page, "Design").click();
    await expect(page).toHaveURL(/\/dev\/workspace$/);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.getByRole("combobox", { name: "Filter by project" })).toHaveText(/All projects/);
  });

  test("should hide and show a project's artifacts with its chevron, and close every project at once", async ({ page }) => {
    await openWorkspace(page);
    const hide = projects(page).getByRole("button", { name: "Hide the artifacts in Design" });
    await expect(hide).toHaveAttribute("aria-expanded", "true");
    await hide.click();
    const show = projects(page).getByRole("button", { name: "Show the artifacts in Design" });
    await expect(show).toHaveAttribute("aria-expanded", "false");
    await expect(group(page, "Design").locator("li")).toHaveCount(0);
    await show.focus();
    await page.keyboard.press("Enter");
    await expect(group(page, "Design").locator("li")).toHaveCount(2);

    await projects(page).getByRole("button", { name: "Close every project" }).click();
    await expect(group(page, "Research").locator("li")).toHaveCount(0);
    await expect(group(page, "Design").locator("li")).toHaveCount(0);
    await projects(page).getByRole("button", { name: "Open every project" }).click();
    await expect(group(page, "Design").locator("li")).toHaveCount(2);
    await expect(group(page, "Research").locator("li")).toHaveCount(1);
  });

  test("should open a closed group when a notification opens an artifact in it", async ({ page }) => {
    await openWorkspace(page);
    await projects(page).getByRole("button", { name: "Hide the artifacts in Design" }).click();
    await expect(group(page, "Design").locator("li")).toHaveCount(0);
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await page.getByRole("dialog").getByRole("link").filter({ hasText: "approved your changes to Long markdown fixture" }).click();
    await expect(page.getByRole("region", { name: "Edit Long markdown fixture" })).toBeVisible();
    await expect(projects(page).getByRole("button", { name: "Hide the artifacts in Design" })).toHaveAttribute("aria-expanded", "true");
    await expect(card(page, "Long markdown fixture").getByRole("button").first()).toHaveAttribute("aria-current", "true");
  });

  test("should highlight the project under a dragged card, move it on drop, and undo the move", async ({ page }) => {
    await openWorkspace(page);
    const note = card(page, "Note 2");
    await expectIn(page, "Note 2", "Unfiled");

    await dragCard(page, note, entry(page, "Research"), async () => {
      await expect(entryRow(page, "Research")).toHaveAttribute("data-drop-target", "");
      await expect(projects(page)).toContainText("Drop on a project");
    });
    await expect(entryRow(page, "Research")).not.toHaveAttribute("data-drop-target");
    await expectIn(page, "Note 2", "Research");
    await expect(entry(page, "Research")).toHaveText(/Research\s*2/);

    await expect(page.getByText("Moved “Note 2” to Research.")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expectIn(page, "Note 2", "Unfiled");
    await expect(entry(page, "Research")).toHaveText(/Research\s*1/);
  });

  test("should take an artifact out of its project when it is dropped on Unfiled", async ({ page }) => {
    await openWorkspace(page);
    const csv = card(page, "Long csv fixture");
    await dragCard(page, csv, entry(page, "Unfiled"));
    await expectIn(page, "Long csv fixture", "Unfiled");
    await expect(entry(page, "Research")).toHaveText(/Research\s*0/);
    // Research is the viewer's own, so it stays when it is empty; it has nothing to show or hide.
    await expect(projects(page).getByRole("button", { name: /artifacts in Research$/ })).toHaveCount(0);
    await expect(page.getByText("Took “Long csv fixture” out of Research.")).toBeVisible();
  });

  test("should roll the card back and say why when the move is refused", async ({ page }) => {
    await openWorkspace(page);
    const locked = card(page, "Locked note");
    await dragCard(page, locked, entry(page, "Design"));
    await expect(page.getByText("Artifact not found, or you cannot edit it.")).toBeVisible();
    await expectIn(page, "Locked note", "Unfiled");
    await expect(entry(page, "Design")).toHaveText(/Design\s*2/);
  });

  test("should refuse a drop on a team project when the artifact is private, and say to share it first", async ({ page }) => {
    await openWorkspace(page);
    // A note near the top of Unfiled, so Launch stays in view while it is dragged.
    const note = card(page, "Note 3");
    const launch = teamEntryName("Launch", "Acme");
    await dragCard(page, note, teamEntry(page, "Launch", "Acme"), async () => {
      await expect(entryRow(page, "Launch", launch)).toHaveAttribute("data-drop-target", "blocked");
    });
    await expect(page.getByText("Share it with Acme first to put it in Launch.")).toBeVisible();
    await expectIn(page, "Note 3", "Unfiled");
    await expect(teamEntry(page, "Launch", "Acme")).toHaveText(/Launch\s*Acme\s*1/);
    await expect(entry(page, "Unfiled")).toHaveText(/Unfiled\s*36/);
  });

  test("should show a team project as closed in the row menu, with the same hint, when the artifact is private", async ({ page }) => {
    await openWorkspace(page);
    await card(page, "Note 6").getByRole("button", { name: "Move to project" }).click();
    const launch = page.getByRole("menuitem", { name: /Launch/ });
    await expect(launch).toHaveAttribute("aria-disabled", "true");
    await expect(launch).toContainText("Share it with Acme first to put it in Launch.");
    await expect(page.getByRole("menuitem", { name: /Research/ })).not.toHaveAttribute("aria-disabled", "true");
  });

  test("should move an artifact from the row menu with the keyboard only", async ({ page }) => {
    await openWorkspace(page);
    const note = card(page, "Note 3");
    const trigger = note.getByRole("button", { name: "Move to project" });
    await expect(trigger).toHaveAccessibleDescription("Note 3");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("menuitem", { name: "Design" }).focus();
    await page.keyboard.press("Enter");
    await expectIn(page, "Note 3", "Design");
    await expect(entry(page, "Design")).toHaveText(/Design\s*3/);
  });

  test("should create, rename, and delete a project from the sidebar and keep its artifacts", async ({ page }) => {
    await openWorkspace(page);
    await projects(page).getByRole("button", { name: "New project" }).click();
    const name = page.getByRole("textbox", { name: "New project name" });
    await name.press("Enter");
    await expect(projects(page).getByRole("alert")).toHaveText("Give the project a name.");
    await name.fill("Roadmap");
    await name.press("Enter");
    await expect(entry(page, "Roadmap")).toHaveText(/Roadmap\s*0/);

    const note = card(page, "Note 4");
    await dragCard(page, note, entry(page, "Roadmap"));
    await expectIn(page, "Note 4", "Roadmap");

    await projects(page).getByRole("button", { name: "Options for Roadmap" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const rename = page.getByRole("textbox", { name: "New name for Roadmap" });
    await rename.fill("Roadmap 2027");
    await rename.press("Enter");
    await expect(entry(page, "Roadmap 2027")).toHaveText(/Roadmap 2027\s*1/);
    await expectIn(page, "Note 4", "Roadmap 2027");

    await projects(page).getByRole("button", { name: "Options for Roadmap 2027" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this project?" });
    await expect(dialog).toContainText("Its 1 artifact stays and just leaves the project.");
    await expect(dialog.getByText("Don't ask again")).toBeVisible();
    await dialog.getByRole("button", { name: "Delete project" }).click();
    await expect(entry(page, "Roadmap 2027")).toHaveCount(0);
    await expectIn(page, "Note 4", "Unfiled");
  });

  test("should offer only a name for a new project in the viewer's own list, never a team to make it for", async ({ page }) => {
    await openWorkspace(page);
    await projects(page).getByRole("button", { name: "New project" }).click();
    await expect(page.getByRole("textbox", { name: "New project name" })).toBeVisible();
    await expect(projects(page).getByRole("combobox")).toHaveCount(0);
  });
});

/*
 * The viewer's own list is theirs. A team's project shows there only while
 * it holds one of their artifacts, it says which team it is shared with, and
 * it is never renamed or deleted from there.
 */
test("should leave a team's project out of the viewer's own list when it holds none of their artifacts", async ({ page }) => {
  await openWorkspace(page);
  await expect(teamEntry(page, "Launch", "Acme")).toBeVisible();
  await expect(projects(page).getByRole("button", { name: /^Handbook/ })).toHaveCount(0);
  await expect(projects(page).getByRole("group", { name: "Handbook" })).toHaveCount(0);
});

test("should name the team beside a team's project and offer no rename or delete for it", async ({ page }) => {
  await openWorkspace(page);
  await expect(teamEntry(page, "Launch", "Acme")).toBeVisible();
  await expect(entryRow(page, "Launch", teamEntryName("Launch", "Acme")).locator("[data-slot=project-team]")).toHaveText("Acme");
  await expectIn(page, "Note 30", "Launch");
  // The viewer's own projects keep their menu; the team's has none here.
  await expect(projects(page).getByRole("button", { name: "Options for Design" })).toHaveCount(1);
  await expect(projects(page).getByRole("button", { name: "Options for Launch" })).toHaveCount(0);
});

test("should take a team's project off the viewer's own list when their last artifact leaves it", async ({ page }) => {
  await openWorkspace(page);
  const shared = card(page, "Note 30");
  await shared.getByRole("button", { name: "Move to project" }).click();
  await page.getByRole("menuitem", { name: "Unfiled" }).click();
  await expectIn(page, "Note 30", "Unfiled");
  await expect(projects(page).getByRole("button", { name: /^Launch/ })).toHaveCount(0);
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "the phone layout");

  test("should move artifacts from the row menu, never by dragging", async ({ page }) => {
    await openWorkspace(page);
    const note = card(page, "Note 2");
    await expect(note).not.toHaveAttribute("draggable", "true");

    await note.getByRole("button", { name: "Move to project" }).tap();
    await page.getByRole("menuitem", { name: "Research" }).tap();
    await expectIn(page, "Note 2", "Research");
    await expect(entry(page, "Research")).toHaveText(/Research\s*2/);
  });
});
