import { expect, test } from "@playwright/test";

const themes = ["light", "dark"] as const;

const storySections = [
  // The hero demo stays directly under the hero; How it works follows it.
  "Product demo",
  "Use it like the artifacts you already know.",
  "One surface for people and agents.",
  "But switching accounts cuts you off.",
  "Pricing",
  "Bring your team and your agents into one space.",
] as const;

for (const theme of themes) {
  test(`should tell the shared-surface story in order without sideways scroll when the site theme is ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => { window.localStorage.setItem("theme", value); }, theme);
    await page.goto("/");

    const hero = page.getByRole("heading", { level: 1, name: "The collaboration space for humans and agents." });
    await expect(hero).toBeVisible();

    const how = page.getByRole("region", { name: "Use it like the artifacts you already know." });
    await how.scrollIntoViewIfNeeded();
    for (const step of ["Add the skill", "Ask the way you always do", "Edit, share, and work together"]) {
      await expect(how.getByRole("heading", { level: 3, name: step })).toBeVisible();
    }

    const surface = page.getByRole("region", { name: "One surface for people and agents." });
    await surface.scrollIntoViewIfNeeded();
    await expect(surface.getByText("Read the plan before the code.")).toBeVisible();
    await expect(surface.getByText("Correct course together.")).toBeVisible();
    await expect(surface.getByText("Keep the why.")).toBeVisible();

    const why = page.getByRole("region", { name: "But switching accounts cuts you off." });
    await why.scrollIntoViewIfNeeded();
    await expect(why.getByRole("heading", { level: 3, name: "One place for every artifact" })).toBeVisible();
    await expect(why.getByText("Switch accounts. Lose nothing.")).toBeVisible();
    await expect(why.getByText("Every agent sees the same artifacts.")).toBeVisible();
    await expect(why.getByText("Your team sees them too.")).toBeVisible();

    const heroTop = (await hero.boundingBox())?.y ?? Number.NaN;
    const tops = [heroTop];
    for (const name of storySections) {
      const box = await page.getByRole("region", { name }).boundingBox();
      tops.push(box?.y ?? Number.NaN);
    }
    const inOrder = tops.every((top, index) => index === 0 || top > (tops[index - 1] ?? Number.POSITIVE_INFINITY));
    expect(inOrder, `sections run hero, ${storySections.join(", ")}`).toBe(true);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
  });
}

test("should jump to the How it works section when the header link is clicked", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the link is hidden on phones");
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/#how$/);
  await expect(page.getByRole("heading", { level: 2, name: "Use it like the artifacts you already know." })).toBeInViewport();
});

test("should set the header nav links in medium weight when the landing page loads", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the section links are hidden on phones");
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveCSS("font-weight", "500");
  await expect(header.getByRole("link", { name: "How it works" })).toHaveCSS("font-weight", "500");
});

const plans = [
  { name: "Individuals", lead: "Free forever for everyone who signs up now." },
  { name: "Teams", lead: "Your people and your agents work from the same artifacts." },
] as const;

for (const theme of themes) {
  test(`should show the Individuals and Teams plans with one button below each plan's copy when the site theme is ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => { window.localStorage.setItem("theme", value); }, theme);
    await page.goto("/");
    const pricing = page.getByRole("region", { name: "Pricing" });
    await pricing.scrollIntoViewIfNeeded();

    for (const { name, lead: leadText } of plans) {
      const plan = pricing.getByRole("article", { name });
      await expect(plan.getByRole("heading", { name, level: 3 })).toBeVisible();
      await expect(plan.getByText("$0")).toBeVisible();
      const lead = plan.getByText(leadText);
      const button = plan.getByRole("button");
      await expect(button).toHaveCount(1);
      const leadBox = await lead.boundingBox();
      const buttonBox = await button.boundingBox();
      expect(leadBox && buttonBox && buttonBox.y > leadBox.y + leadBox.height, `the ${name} button sits below its copy`).toBe(true);
    }
    await expect(pricing.getByRole("article", { name: "Individuals" }).getByRole("button", { name: "Get started" })).toHaveAttribute("href", "/sign-up");
    await expect(pricing.getByRole("article", { name: "Teams" }).getByRole("button", { name: "Start a team" })).toHaveAttribute("href", "/sign-up?next=%2Fteams%2Fnew");
    await expect(pricing.getByText("Free today for individuals and teams. Accounts and teams made now stay free, even if we add paid plans later.")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
  });
}

test("should fill the section width with two equal plan cards when the window is desktop sized", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop layout only");
  await page.goto("/");
  const pricing = page.getByRole("region", { name: "Pricing" });
  await pricing.scrollIntoViewIfNeeded();
  const layout = await pricing.evaluate((section) => {
    const style = getComputedStyle(section);
    const box = section.getBoundingClientRect();
    const contentLeft = box.left + parseFloat(style.paddingLeft);
    const contentRight = box.right - parseFloat(style.paddingRight);
    const cards = [...section.querySelectorAll("article")].map((card) => card.getBoundingClientRect());
    const buttons = [...section.querySelectorAll("article a")].map((link) => link.getBoundingClientRect().bottom);
    return { contentLeft, contentRight, cards: cards.map(({ left, right, top, width, height }) => ({ left, right, top, width, height })), buttons };
  });
  const [first, second] = layout.cards;
  expect(layout.cards).toHaveLength(2);
  if (!first || !second) return;
  expect(Math.abs(first.left - layout.contentLeft), "the first card starts at the section's left edge").toBeLessThanOrEqual(2);
  expect(Math.abs(second.right - layout.contentRight), "the second card ends at the section's right edge").toBeLessThanOrEqual(2);
  const contentWidth = layout.contentRight - layout.contentLeft;
  expect(first.width + second.width, "the cards fill most of the width, with only the gap between them").toBeGreaterThan(contentWidth - 48);
  expect(Math.abs(first.top - second.top), "the cards sit side by side").toBeLessThanOrEqual(1);
  expect(Math.abs(first.width - second.width), "the cards are equally wide").toBeLessThanOrEqual(1);
  expect(Math.abs(first.height - second.height), "the cards are equally tall").toBeLessThanOrEqual(1);
  const [firstButton, secondButton] = layout.buttons;
  expect(firstButton !== undefined && secondButton !== undefined && Math.abs(firstButton - secondButton) <= 1, "the buttons line up").toBe(true);
});

test("should stack the plan cards without sideways scroll when the window is phone sized", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone layout only");
  await page.goto("/");
  const pricing = page.getByRole("region", { name: "Pricing" });
  await pricing.scrollIntoViewIfNeeded();
  const individuals = await pricing.getByRole("article", { name: "Individuals" }).boundingBox();
  const teams = await pricing.getByRole("article", { name: "Teams" }).boundingBox();
  expect(individuals && teams && teams.y >= individuals.y + individuals.height, "Teams sits below Individuals").toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
});

for (const width of [640, 768, 1024]) {
  test(`should fit the header without sideways scroll when the window is ${String(width)}px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(0);
    const fit = await page.getByRole("navigation", { name: "Main navigation" }).evaluate((nav) => {
      const logo = nav.parentElement?.firstElementChild?.getBoundingClientRect();
      const box = nav.getBoundingClientRect();
      return { navRight: box.right, gap: logo ? box.left - logo.right : -1 };
    });
    expect(fit.navRight).toBeLessThanOrEqual(width);
    expect(fit.gap, "the nav must not touch the logo").toBeGreaterThanOrEqual(16);
    if (width < 1024) return;
    const center = await page.getByRole("navigation", { name: "Main navigation" }).evaluate((nav) => {
      const box = nav.getBoundingClientRect();
      const header = nav.closest("header")?.getBoundingClientRect();
      return header ? Math.abs(box.left + box.width / 2 - (header.left + header.width / 2)) : Number.NaN;
    });
    expect(center, "from 1024px the section links sit in the middle of the header").toBeLessThanOrEqual(2);
  });
}
