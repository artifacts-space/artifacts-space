import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The Projects group in the workspace sidebar, on /dev/workspace: the real
 * workspace with projects kept in memory. "Design" holds two artifacts,
 * "Research" one, the team project "Launch" none, and "Locked note" refuses
 * every move, as an artifact the viewer cannot edit would.
 */

const projects = (page: Page) => page.getByRole("region", { name: "Projects" });
const entryName = (name: string) => new RegExp(`^${name}, \\d+ artifacts?$`);
const entry = (page: Page, name: string) => projects(page).getByRole("button", { name: entryName(name) });
const card = (page: Page, title: string) =>
  page.locator("[data-slot=artifact-list] li").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

/** The project line on a card: its project's name, or "No project". */
function projectLine(item: Locator) {
  return item.locator("p").nth(1);
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
  test.skip(({ isMobile }) => isMobile, "phones move artifacts from the card menu");

  test("should list projects with counts and filter the list when one is clicked", async ({ page }) => {
    await openWorkspace(page);
    await expect(entry(page, "Design")).toHaveText(/Design\s*2/);
    await expect(entry(page, "Research")).toHaveText(/Research\s*1/);
    await expect(entry(page, "Launch")).toHaveText(/Launch\s*0/);
    await expect(entry(page, "No project")).toBeVisible();

    await entry(page, "Design").click();
    await expect(page).toHaveURL(/\/dev\/workspace\?project=design$/);
    await expect(page.locator("[data-slot=artifact-list] li")).toHaveCount(2);
    await expect(entry(page, "Design")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("combobox", { name: "Filter by project" })).toHaveText(/Design/);

    // Clicking the chosen project again shows every artifact.
    await entry(page, "Design").click();
    await expect(page).toHaveURL(/\/dev\/workspace$/);
    await expect(page.getByRole("combobox", { name: "Filter by project" })).toHaveText(/All projects/);
  });

  test("should highlight the project under a dragged card, move it on drop, and undo the move", async ({ page }) => {
    await openWorkspace(page);
    const note = card(page, "Note 2");
    await expect(projectLine(note)).toHaveText(/No project/);

    const research = projects(page).locator("li").filter({ has: page.getByRole("button", { name: entryName("Research") }) });
    await dragCard(page, note, entry(page, "Research"), async () => {
      await expect(research).toHaveAttribute("data-drop-target", "");
      await expect(projects(page)).toContainText("Drop on a project");
    });
    await expect(research).not.toHaveAttribute("data-drop-target");
    await expect(projectLine(note)).toHaveText(/Research/);
    await expect(entry(page, "Research")).toHaveText(/Research\s*2/);

    await expect(page.getByText("Moved “Note 2” to Research.")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(projectLine(note)).toHaveText(/No project/);
    await expect(entry(page, "Research")).toHaveText(/Research\s*1/);
  });

  test("should take an artifact out of its project when it is dropped on No project", async ({ page }) => {
    await openWorkspace(page);
    const csv = card(page, "Long csv fixture");
    await dragCard(page, csv, entry(page, "No project"));
    await expect(projectLine(csv)).toHaveText(/No project/);
    await expect(entry(page, "Research")).toHaveText(/Research\s*0/);
    await expect(page.getByText("Took “Long csv fixture” out of Research.")).toBeVisible();
  });

  test("should roll the card back and say why when the move is refused", async ({ page }) => {
    await openWorkspace(page);
    const locked = card(page, "Locked note");
    await dragCard(page, locked, entry(page, "Design"));
    await expect(page.getByText("Artifact not found, or you cannot edit it.")).toBeVisible();
    await expect(projectLine(locked)).toHaveText(/No project/);
    await expect(entry(page, "Design")).toHaveText(/Design\s*2/);
  });

  test("should refuse a drop on a team project when the artifact is private, and say to share it first", async ({ page }) => {
    await openWorkspace(page);
    const note = card(page, "Note 5");
    const launch = projects(page).locator("li").filter({ has: page.getByRole("button", { name: entryName("Launch") }) });
    await dragCard(page, note, entry(page, "Launch"), async () => {
      await expect(launch).toHaveAttribute("data-drop-target", "blocked");
    });
    await expect(page.getByText("Share it with Acme first to put it in Launch.")).toBeVisible();
    await expect(projectLine(note)).toHaveText(/No project/);
    await expect(entry(page, "Launch")).toHaveText(/Launch\s*0/);
    await expect(entry(page, "No project")).toHaveText(/No project\s*37/);
  });

  test("should show a team project as closed in the card menu, with the same hint, when the artifact is private", async ({ page }) => {
    await openWorkspace(page);
    await card(page, "Note 6").getByRole("button", { name: "Move to project" }).click();
    const launch = page.getByRole("menuitem", { name: /Launch/ });
    await expect(launch).toHaveAttribute("aria-disabled", "true");
    await expect(launch).toContainText("Share it with Acme first to put it in Launch.");
    await expect(page.getByRole("menuitem", { name: /Research/ })).not.toHaveAttribute("aria-disabled", "true");
  });

  test("should move an artifact from the card menu with the keyboard only", async ({ page }) => {
    await openWorkspace(page);
    const note = card(page, "Note 3");
    const trigger = note.getByRole("button", { name: "Move to project" });
    await expect(trigger).toHaveAccessibleDescription("Note 3");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("menuitem", { name: "Design" }).focus();
    await page.keyboard.press("Enter");
    await expect(projectLine(note)).toHaveText(/Design/);
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
    await expect(projectLine(note)).toHaveText(/Roadmap/);

    await projects(page).getByRole("button", { name: "Options for Roadmap" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const rename = page.getByRole("textbox", { name: "New name for Roadmap" });
    await rename.fill("Roadmap 2027");
    await rename.press("Enter");
    await expect(entry(page, "Roadmap 2027")).toHaveText(/Roadmap 2027\s*1/);
    await expect(projectLine(note)).toHaveText(/Roadmap 2027/);

    await projects(page).getByRole("button", { name: "Options for Roadmap 2027" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this project?" });
    await expect(dialog).toContainText("Its 1 artifact stays and just leaves the project.");
    await expect(dialog.getByText("Don't ask again")).toBeVisible();
    await dialog.getByRole("button", { name: "Delete project" }).click();
    await expect(entry(page, "Roadmap 2027")).toHaveCount(0);
    await expect(projectLine(note)).toHaveText(/No project/);
    await expect(note).toBeVisible();
  });

  test("should label a team project with its team in the project's menu", async ({ page }) => {
    await openWorkspace(page);
    await projects(page).getByRole("button", { name: "Options for Launch" }).click();
    await expect(page.getByRole("menu")).toContainText("Acme");
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "the phone layout");

  test("should move artifacts from the card menu, never by dragging", async ({ page }) => {
    await openWorkspace(page);
    const note = card(page, "Note 2");
    await expect(note).not.toHaveAttribute("draggable", "true");

    const toggle = projects(page).getByRole("button", { name: "Projects", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await note.getByRole("button", { name: "Move to project" }).tap();
    await page.getByRole("menuitem", { name: "Research" }).tap();
    await expect(projectLine(note)).toHaveText(/Research/);

    await toggle.tap();
    await expect(entry(page, "Research")).toHaveText(/Research\s*2/);
  });
});
