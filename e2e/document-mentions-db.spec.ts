import { expect, test } from "./support/test";

import { closeInboxDb, documentMentionRecipients, giveHandle } from "./support/inbox-db";
import { addTestMember, cleanUp, createTestArtifact, createTestTeam, createTestUser, deleteTestTeams, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser, shareTestArtifact } from "./support/local-db";

/**
 * An @mention in a document's own text, end to end against a real database:
 * typing "@" on the artifact's page lists the editor's teammates, a pick
 * writes the handle, the save tells that teammate (a document mention in
 * their Inbox), and the page then shows the handle as a mention. Needs dev
 * sign-in and a local throwaway database (support/local-db.ts); skipped
 * otherwise. The picker alone runs in CI on a fixture (document-mentions.spec.ts).
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];
const people: string[] = [];
const teams: string[] = [];

test.afterAll(async () => {
  await closeInboxDb();
  await cleanUp(created, []);
  await deleteTestTeams(teams);
  await cleanUp([], people);
});

test("should tell a teammate picked from the @ list once the document is saved, and show the mention on the page", async ({ page }, testInfo) => {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const me = await readyDevUser();
  const teammate = await createTestUser();
  people.push(teammate);
  const handle = `mate-${teammate.slice(0, 8)}`;
  await giveHandle(teammate, handle);
  const team = await createTestTeam(me);
  teams.push(team.id);
  await addTestMember(team.id, teammate, "member");
  const publicId = await createTestArtifact({ userId: me, title: `Mention ${testInfo.project.name}`, content: "Launch plan.", visibility: "private", theme: null });
  created.push(publicId);
  await shareTestArtifact(publicId, team.id, "team");

  await page.goto(`/artifact/${publicId}`);
  const body = page.getByRole("textbox", { name: "Artifact content" });
  await body.getByText("Launch plan.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Over to @mate");
  await page.getByRole("listbox", { name: "Mention suggestions" }).getByRole("option", { name: new RegExp(`@${handle}`) }).click();

  await expect(body.locator(`[data-mention="${handle}"]`)).toHaveText(`@${handle}`);
  await expect(page.getByRole("banner").locator("[data-slot=save-indicator]")).toHaveText("Saved", { timeout: 12_000 });
  // The teammate is told after the save's response.
  await expect.poll(() => documentMentionRecipients(publicId)).toEqual([teammate]);

  // A fresh load draws the delivered mention in the read view, before the editor takes over, and in the editor after.
  await page.reload();
  await expect(page.locator(`[data-mention-kind=person], [data-mention="${handle}"]`).first()).toHaveText(`@${handle}`);
  await expect(page.getByRole("textbox", { name: "Artifact content" }).locator(`[data-mention="${handle}"]`)).toHaveText(`@${handle}`);
});
