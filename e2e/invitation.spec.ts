import { expect, test, type Page } from "@playwright/test";

/**
 * The invitation page in every state, the sign-in hint for invitation
 * links, and the team page's rule and invitation controls, measured on the
 * fixture pages (/dev/invitation and /dev/team) with no database, on a phone
 * and a desktop viewport.
 */

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

const headings: [string, string][] = [
  ["open", "Join Northwind Studio"],
  ["verify", "Confirm your email to see this invitation"],
  ["member", "You are already in Northwind Studio"],
  ["other-email", "This invitation is for another email address"],
  ["expired", "This invitation expired"],
  ["used", "This invitation was already used"],
  ["canceled", "This invitation was canceled"],
  ["declined", "You declined this invitation"],
  ["missing", "We could not find this invitation"],
];

test("should give every invitation state a plain heading, a way on, and no sideways scroll", async ({ page }) => {
  for (const [state, heading] of headings) {
    await page.goto(`/dev/invitation?state=${state}`);
    await expect(page.getByRole("heading", { level: 1 }), state).toHaveText(heading);
    const wayOn = page.getByRole("button").or(page.getByRole("link", { name: /Go to your teams|Open Northwind Studio/ }));
    await expect(wayOn.first(), state).toBeVisible();
    expect(await pageOverflow(page), state).toBeLessThanOrEqual(0);
  }
});

test("should offer to join and say members edit directly when the invitation is open", async ({ page }) => {
  await page.goto("/dev/invitation?state=open");
  await expect(page.getByText(/Dana Reyes invited you as member\. You can edit the team's artifacts as soon as you join/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Join team" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Decline" })).toBeVisible();
});

test("should never name the team to an account the invitation was not sent to", async ({ page }) => {
  for (const state of ["other-email", "missing"]) {
    await page.goto(`/dev/invitation?state=${state}`);
    await expect(page.getByText("Northwind Studio")).toHaveCount(0);
    await expect(page.getByText("Dana Reyes")).toHaveCount(0);
  }
  await page.goto("/dev/invitation?state=other-email");
  await expect(page.getByText("You are signed in as sam.longaddress@example.com.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with another email" })).toBeVisible();
});

test("should show no team details to an account whose matching address is not confirmed", async ({ page }) => {
  for (const state of ["verify", "expired", "used", "canceled", "declined"]) {
    await page.goto(`/dev/invitation?state=${state}&unconfirmed=1`);
    await expect(page.getByRole("heading", { level: 1 }), state).toBeVisible();
    await expect(page.getByText(/Northwind Studio|Dana Reyes/), state).toHaveCount(0);
  }
  await page.goto("/dev/invitation?state=expired&unconfirmed=1");
  await expect(page.getByText("The link stopped working after 7 days. Ask the person who invited you to send a new one.")).toBeVisible();
  await page.goto("/dev/invitation?state=expired");
  await expect(page.getByText(/invited you to Northwind Studio/)).toBeVisible();
});

test("should tell someone signing in from an invitation which address to use, and nobody else", async ({ page }) => {
  await page.goto("/sign-in?next=%2Finvitations%2Fabc123");
  await expect(page.locator("[data-slot=invitation-hint]")).toHaveText("Use the email address your invitation went to. You come back to the invitation after you sign in.");
  await page.goto("/sign-up?next=%2Finvitations%2Fabc123");
  await expect(page.locator("[data-slot=invitation-hint]")).toBeVisible();
  await page.goto("/sign-in?next=%2Fteams%2Fnew");
  await expect(page.locator("[data-slot=invitation-hint]")).toHaveCount(0);
});

test("should state the team's editing and sharing rule on the team page", async ({ page }) => {
  await page.goto("/dev/team?as=member");
  const rule = page.locator("[data-slot=team-rule]");
  await expect(rule.getByRole("heading", { name: "How this team works" })).toBeVisible();
  await expect(rule).toContainText("Edit the team's artifacts directly. Your changes save at once, with no approval.");
  await expect(rule).toContainText("Sharing your own artifacts with the team needs approval from someone who can approve sharing (owners and admins by default).");
  await expect(rule).toContainText("Sharing by link or in public needs approval from someone who can approve sharing (owners and admins by default).");

  await page.goto("/dev/team?as=admin");
  await expect(page.locator("[data-slot=team-rule]")).toContainText("You can share by link or in public right away.");

  await page.goto("/dev/team?personal=1");
  await expect(page.locator("[data-slot=team-rule]")).toHaveCount(0);
});

test("should say what each invited role can do", async ({ page }) => {
  await page.goto("/dev/team");
  await page.getByRole("button", { name: "Invite people" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite people" });
  await expect(dialog).toContainText("They can edit the team's artifacts as soon as they join.");
  await expect(dialog.locator("#invite-role-hint")).toHaveText("Edits the team's artifacts and asks before sharing outside the team.");
  await dialog.getByRole("combobox", { name: "Role for the invited person" }).click();
  await page.getByRole("option", { name: "Admin" }).click();
  await expect(dialog.locator("#invite-role-hint")).toHaveText("Edits the team's artifacts and shares by link and in public without asking. Also invites people, approves sharing, adds agents.");
});

test("should mark an expired invitation and offer a new one instead of its dead link", async ({ page }) => {
  await page.goto("/dev/team");
  const expired = page.getByRole("table", { name: "Members" }).locator("[data-member-row=invitation][data-expired=true]");
  await expect(expired).toContainText("late.reply@example.com");
  await expect(expired).toContainText("Expired");
  await page.getByRole("button", { name: "Actions for the invitation to late.reply@example.com" }).click();
  await expect(page.getByRole("menuitem", { name: "Send a new invitation" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Remove" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Copy invitation link" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Actions for the invitation to new.teammate@example.com" }).click();
  await expect(page.getByRole("menuitem", { name: "Copy invitation link" })).toBeVisible();
});
