import type { Locator, Page } from "@playwright/test";
import { expectNoAxeViolations } from "./support/a11y";
import { expect, test } from "./support/test";

/**
 * The project tree in the workspace sidebar, on /dev/workspace: the real
 * workspace with projects kept in memory. "Design" holds two artifacts and
 * "Research" one, both the viewer's own: their own list never holds a
 * team's project (the server sends none; src/lib/projects/sidebar-queries).
 * "Locked note" refuses every move, as an artifact the viewer cannot edit
 * would. Every other artifact has no project: those are listed plainly after
 * the projects, never as a project.
 */

const projects = (page: Page) => page.getByRole("region", { name: "Projects" });
const entryName = (name: string) => new RegExp(`^${name}, \\d+ artifacts?$`);
const entry = (page: Page, name: string) => projects(page).getByRole("button", { name: entryName(name) });
/** A group's row: the drop target, holding the disclosure, the name, and the menu. */
const entryRow = (page: Page, name: string) => projects(page).locator("[data-slot=project-row]").filter({ has: page.getByRole("button", { name: entryName(name) }) });
const group = (page: Page, name: string) => projects(page).getByRole("group", { name, exact: true });
const card = (page: Page, title: string) =>
  page.locator("[data-slot=artifact-list] li").filter({ has: page.getByText(title, { exact: true }) });

/** The artifacts in no project, after the projects. */
const loose = (page: Page) => page.getByRole("region", { name: "Artifacts without a project" });

/** Checks which project of the tree an artifact sits under. */
async function expectIn(page: Page, title: string, groupName: string) {
  await expect(group(page, groupName).getByText(title, { exact: true })).toBeVisible();
}

/** Checks that an artifact is listed after the projects, in none of them. */
async function expectLoose(page: Page, title: string) {
  await expect(loose(page).getByText(title, { exact: true })).toBeVisible();
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

  test("should list projects with counts and their artifacts, and filter the list when a name is clicked", async ({ page }) => {
    await openWorkspace(page);
    await expect(entry(page, "Design")).toHaveText(/Design\s*2/);
    await expect(entry(page, "Research")).toHaveText(/Research\s*1/);
    await expect(group(page, "Design").locator("li")).toHaveCount(2);
    await expectIn(page, "Long csv fixture", "Research");
    const names = await projects(page).getByRole("group").evaluateAll((groups) => groups.map((item) => item.getAttribute("aria-label")));
    expect(names, "only real projects are in the Projects list").toEqual(["Design", "Research"]);

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
    await expectLoose(page, "Note 2");

    await dragCard(page, note, entry(page, "Research"), async () => {
      await expect(entryRow(page, "Research")).toHaveAttribute("data-drop-target", "");
      await expect(projects(page)).toContainText("Drop on a project");
    });
    await expect(entryRow(page, "Research")).not.toHaveAttribute("data-drop-target");
    await expectIn(page, "Note 2", "Research");
    await expect(entry(page, "Research")).toHaveText(/Research\s*2/);

    await expect(page.getByText("Moved “Note 2” to Research.")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expectLoose(page, "Note 2");
    await expect(entry(page, "Research")).toHaveText(/Research\s*1/);
  });

  test("should take an artifact out of its project when it is dropped on the artifacts without a project", async ({ page }) => {
    await openWorkspace(page);
    const csv = card(page, "Long csv fixture");
    await dragCard(page, csv, loose(page).getByRole("heading"), async () => {
      await expect(loose(page).getByRole("heading")).toHaveText("Drop here to take it out of its project");
      await expect(loose(page)).toHaveAttribute("data-drop-target", "");
    });
    await expect(loose(page)).not.toHaveAttribute("data-drop-target");
    await expect(loose(page).getByRole("heading")).toHaveText("Artifacts");
    await expectLoose(page, "Long csv fixture");
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
    await expectLoose(page, "Locked note");
    await expect(entry(page, "Design")).toHaveText(/Design\s*2/);
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
    await expectLoose(page, "Note 4");
    await expect(page.getByText("Deleted “Roadmap 2027”. Its artifacts are still here, with no project.")).toBeVisible();
  });

  test("should offer only a name for a new project in the viewer's own list, never a team to make it for", async ({ page }) => {
    // The viewer is in three shared teams here. A team's project is made in the team's workspace.
    await openWorkspace(page, "/dev/workspace?scopes=1");
    await projects(page).getByRole("button", { name: "New project" }).click();
    await expect(page.getByRole("textbox", { name: "New project name" })).toBeVisible();
    await expect(projects(page).getByRole("combobox")).toHaveCount(0);
  });
});

/*
 * An artifact does not need a project. Those without one are listed plainly
 * after the projects: no row that looks like a project, no dot, no count.
 */
test("should list the artifacts without a project plainly after the projects, never as a project", async ({ page }) => {
  await openWorkspace(page);
  await expect(projects(page).getByRole("button", { name: /^(Unfiled|No project|Artifacts)\b/ })).toHaveCount(0);
  await expect(page.getByText("Unfiled")).toHaveCount(0);
  await expect(loose(page).getByRole("heading", { level: 2 })).toHaveText("Artifacts");
  // Plain artifact rows only: nothing to open or close, no project row, and no count beside the heading.
  await expect(loose(page).locator("[data-slot=project-row]")).toHaveCount(0);
  await expect(loose(page).getByRole("button", { name: /the artifacts in/ })).toHaveCount(0);
  await expect(loose(page).locator("li")).toHaveCount(37);
  await expect(loose(page).locator("li").first()).toContainText("Long json fixture");
  const after = await loose(page).evaluate((section) => {
    const tree = document.querySelector('section[aria-label="Projects"]');
    return tree !== null && Boolean(tree.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(after, "they come after the projects").toBe(true);
  // Scanned once the page answers a click: a scan marks what it reads, and a mark made before hydration is reported as a mismatch.
  const first = loose(page).locator("li").first().getByRole("button").first();
  await first.click();
  await expect(first).toHaveAttribute("aria-current", "true");
  await expectNoAxeViolations(page.locator("[data-slot=artifact-list]"));
});

test("should show nothing for artifacts without a project when none is listed", async ({ page }) => {
  // The list is filtered to Design: its two artifacts are all there is to show.
  await openWorkspace(page, "/dev/workspace?project=design");
  await expect(group(page, "Design").locator("li")).toHaveCount(2);
  await expect(loose(page)).toHaveCount(0);
  await expect(page.locator("[data-slot=artifact-list]").getByRole("heading", { name: "Artifacts" })).toHaveCount(0);
});

test("should show only the artifacts without a project from the filter, and every project again from its own button", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("combobox", { name: "Filter by project" }).click();
  await page.getByRole("option", { name: /^No project/ }).click();
  await expect(page).toHaveURL(/\/dev\/workspace\?noproject=1$/);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slot=artifact-list] li")).toHaveCount(37);
  await expect(group(page, "Design").locator("li")).toHaveCount(0);
  await loose(page).getByRole("button", { name: "Show every project" }).click();
  await expect(page).toHaveURL(/\/dev\/workspace$/);
  await expect(group(page, "Design").locator("li")).toHaveCount(2);
  await expect(loose(page).getByRole("button", { name: "Show every project" })).toHaveCount(0);
});

test("should show an artifact without a project by its title alone in the top bar", async ({ page }) => {
  await openWorkspace(page);
  await card(page, "Long json fixture").getByRole("button").first().click();
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.locator("[aria-current=page]")).toHaveText("Long json fixture");
  await expect(crumbs.getByRole("listitem")).toHaveCount(1);
});

test.describe("desktop, a drop with no artifact listed outside a project", () => {
  test.skip(({ isMobile }) => isMobile, "phones move artifacts from the row menu");

  test("should give a dragged card a place to leave its project when no artifact without one is listed", async ({ page }) => {
    await openWorkspace(page, "/dev/workspace?project=design");
    await expect(loose(page)).toHaveCount(0);
    const ui = card(page, "Long ui fixture");
    await ui.hover();
    await page.mouse.down();
    // The first moves start the drag; the place to drop then shows.
    const start = await ui.boundingBox();
    if (!start) throw new Error("The card is not on screen.");
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 12, { steps: 4 });
    await expect(loose(page).getByRole("heading")).toHaveText("Drop here to take it out of its project");
    const box = await loose(page).boundingBox();
    if (!box) throw new Error("The drop place is not on screen.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await expect(loose(page)).toHaveAttribute("data-drop-target", "");
    await page.mouse.up();
    await expect(page.getByText("Took “Long ui fixture” out of Design.")).toBeVisible();
    await expect(entry(page, "Design")).toHaveText(/Design\s*1/);
  });
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

    // And out of every project again, from the same menu.
    await card(page, "Note 2").getByRole("button", { name: "Move to project" }).tap();
    await page.getByRole("menuitem", { name: "No project" }).tap();
    await expectLoose(page, "Note 2");
  });
});
