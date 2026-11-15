import type { Locator, Page } from "@playwright/test";

import { actionLabels, pictureLabels, pressButtons, type PressButton } from "../src/lib/ui/templates/behavior";
import { findTemplate, templateCategoriesInUse, templatesIn } from "../src/lib/ui/templates/index";
import type { TemplateCategory, UiTemplate } from "../src/lib/ui/templates/types";

import { countLabels, setFrameWidth, shownButton, signatureOf, type LabelCounts } from "./support/template-frames";
import { drawnMoreThan, mostOf, unreachableIn } from "./support/template-readings";
import { expect, test } from "./support/test";

/*
 * What a reader can do in every section template, at every width, with no
 * list written by hand. The buttons that change state, and the label of
 * every link, button, and picture, are read from each template's fragment
 * (src/lib/ui/templates/behavior.ts); the page draws each template in a
 * 1440, a 768, and a 390 frame (/dev/templates), and the 768 frame is made
 * 640 wide for a fourth reading. Those four widths sit on either side of
 * every step a block changes at (576, 672, and 896 pixels).
 *
 * For each template the loop checks:
 * - a press shows or changes something in its own frame only, and the
 *   button that undoes it brings the frame back;
 * - every link and button a reader can reach at 1440 can be reached at 768,
 *   640, and 390, at rest or after opening a panel;
 * - no link, button, or picture is drawn more often at 768 or 640 than at
 *   390 or 1440, which is what hide steps that differ produce.
 *
 * The frames are the same widths in every project, so this runs once, on
 * the desktop; the phone project keeps the drawing, overflow, and axe checks
 * of templates.spec.ts.
 */

const categories = templateCategoriesInUse();

/** The widths a template is read at, from wide to narrow. 640 is the 768 frame made narrower. */
const readWidths = [1440, 768, 640, 390] as const;
type ReadWidth = (typeof readWidths)[number];

/**
 * Links and buttons a template shows at 1440 and, on purpose, not at a
 * narrower width, each with why. Keep it empty when you can: a reader on a
 * phone should reach what a reader on a desktop does.
 */
const leftOutWhenNarrow: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "navbar-mega-menu": { Product: "it only opens the panel, and in a narrow frame the menu button opens the same panel" },
};

const section = (page: Page, id: string) => page.locator(`[data-template="${id}"]:visible`);

/** The frame a width is read in: its own, or the 768 frame for 640. */
const frameAt = (page: Page, id: string, width: ReadWidth) => section(page, id).locator(`[data-template-frame="${String(width === 640 ? 768 : width)}"]`);

async function open(page: Page, query: string) {
  await page.goto(`/dev/templates?${query}`);
  await expect(page.locator("[data-templates-ready]")).toBeAttached({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** The signatures of every frame of a template except `width`'s, to show a press stayed in its own frame. */
async function otherFrames(page: Page, id: string, width: ReadWidth): Promise<string[]> {
  const own = width === 640 ? 768 : width;
  const others = ([1440, 768, 390] as const).filter((other) => other !== own);
  return Promise.all(others.map((other) => signatureOf(frameAt(page, id, other))));
}

interface Plan {
  template: UiTemplate;
  labels: { actions: string[]; pictures: string[] };
  /** Buttons whose press changes the frame and that another button undoes. */
  reveals: PressButton[];
  /** Buttons whose press changes the frame for good: a form's send, a banner's close. */
  oneWay: PressButton[];
  /** Every label a state-changing button has; each must be pressed in some frame. */
  mustPress: string[];
}

function byLabel(buttons: readonly PressButton[]): PressButton[] {
  return [...new Map(buttons.map((button) => [button.label, button])).values()];
}

function planFor(template: UiTemplate): Plan {
  const { buttons } = pressButtons(template);
  const changing = buttons.filter((button) => button.changesStart);
  return {
    template,
    labels: { actions: actionLabels(template).labels, pictures: pictureLabels(template) },
    reveals: byLabel(changing.filter((button) => button.restoredBy.length > 0)),
    oneWay: byLabel(changing.filter((button) => button.restoredBy.length === 0)),
    mustPress: [...new Set(buttons.map((button) => button.label))],
  };
}

/** Presses `button` and checks that the frame no longer shows what it showed at `rest`, and that no other frame changed. */
async function pressAndExpectChange(page: Page, plan: Plan, width: ReadWidth, frame: Locator, button: PressButton, rest: string): Promise<void> {
  const before = await otherFrames(page, plan.template.id, width);
  await shownButton(frame, button.label).first().click();
  await expect.poll(() => signatureOf(frame), { message: `pressing "${button.label}" at ${String(width)} changes what the frame shows` }).not.toBe(rest);
  expect(await otherFrames(page, plan.template.id, width), `pressing "${button.label}" at ${String(width)} changes that frame only`).toEqual(before);
}

/** Presses the first button a reader can see among `labels`, and returns its label. */
async function pressFirstShown(frame: Locator, labels: readonly string[], why: string): Promise<string> {
  for (const label of labels) {
    if ((await shownButton(frame, label).count()) > 0) {
      await shownButton(frame, label).first().click();
      return label;
    }
  }
  throw new Error(`${why}: none of ${labels.map((label) => `"${label}"`).join(", ")} is shown.`);
}

/** Reads one frame at rest and after each press that another button undoes, pressing and undoing as it goes. */
async function readFrame(page: Page, plan: Plan, width: ReadWidth, pressed: Set<string>): Promise<LabelCounts> {
  const frame = frameAt(page, plan.template.id, width);
  await frame.scrollIntoViewIfNeeded();
  const rest = await signatureOf(frame);
  const readings = [await countLabels(frame, plan.labels)];
  for (const button of plan.reveals) {
    if ((await shownButton(frame, button.label).count()) === 0) continue;
    await pressAndExpectChange(page, plan, width, frame, button, rest);
    readings.push(await countLabels(frame, plan.labels));
    const undo = await pressFirstShown(frame, button.restoredBy, `after "${button.label}" at ${String(width)}, nothing puts the frame back`);
    await expect.poll(() => signatureOf(frame), { message: `"${undo}" at ${String(width)} brings back what "${button.label}" changed` }).toBe(rest);
    pressed.add(button.label).add(undo);
  }
  return mostOf(readings);
}

/** Presses each button nothing undoes, last, in the widest and the narrowest frame: its frame changes and no other does. */
async function pressOneWay(page: Page, plan: Plan, pressed: Set<string>) {
  for (const width of [1440, 390] as const) {
    const frame = frameAt(page, plan.template.id, width);
    for (const button of plan.oneWay) {
      if ((await shownButton(frame, button.label).count()) === 0) continue;
      await frame.scrollIntoViewIfNeeded();
      await pressAndExpectChange(page, plan, width, frame, button, await signatureOf(frame));
      pressed.add(button.label);
    }
  }
}

async function expectBehavior(page: Page, template: UiTemplate) {
  const plan = planFor(template);
  const pressed = new Set<string>();
  const readings = new Map<ReadWidth, LabelCounts>();
  const middle = frameAt(page, template.id, 640);
  for (const width of readWidths) {
    if (width === 640) await setFrameWidth(middle, 640);
    readings.set(width, await readFrame(page, plan, width, pressed));
    if (width === 640) await setFrameWidth(middle, null);
  }
  const at = (width: ReadWidth): LabelCounts => readings.get(width) ?? { actions: {}, pictures: {} };
  const problems: string[] = [];
  for (const width of [768, 640, 390] as const) {
    const missing = unreachableIn(at(width), at(1440), leftOutWhenNarrow[template.id]);
    if (missing.length > 0) problems.push(`at ${String(width)}, a reader cannot reach ${missing.map((label) => `"${label}"`).join(", ")}, at rest or after opening a panel`);
  }
  for (const width of [768, 640] as const) {
    const twice = drawnMoreThan(at(width), [at(1440), at(390)]);
    if (twice.length > 0) problems.push(`at ${String(width)}, drawn more often than at 390 or 1440: ${twice.join(", ")}`);
  }
  await pressOneWay(page, plan, pressed);
  const never = plan.mustPress.filter((label) => !pressed.has(label));
  if (never.length > 0) problems.push(`never shown to press, in any frame: ${never.map((label) => `"${label}"`).join(", ")}`);
  if (problems.length > 0) throw new Error(problems.join("\n"));
}

/** Runs `check` for each template and fails once, naming every template that failed. */
async function forEachTemplate(templates: readonly UiTemplate[], check: (template: UiTemplate) => Promise<void>) {
  const failures: string[] = [];
  for (const template of templates) {
    try {
      await check(template);
    } catch (error) {
      failures.push(`${template.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  expect(failures, failures.join("\n\n")).toEqual([]);
}

function behaviorTests(category: TemplateCategory) {
  test(`should keep every ${category} template's links and buttons reachable and drawn once from 1440 to 390, and undo what a press shows`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the frames are the same widths in every project; once is enough");
    await open(page, `category=${category}`);
    await forEachTemplate(templatesIn(category), (template) => expectBehavior(page, template));
  });
}

for (const category of categories) behaviorTests(category);

/*
 * The checks above must be able to fail. A frame's reading counts a label
 * where it is drawn, sees a press, and tells a panel that was opened from
 * one that was not.
 */
test("should count a label where it is drawn, and see a press change one frame, so the checks above can fail", async ({ page, isMobile }) => {
  test.skip(isMobile, "the frames are the same widths in every project; once is enough");
  await open(page, "template=navbar-basic");
  const labels = { actions: ["Open menu", "Close menu", "Not a label"], pictures: [] };
  const narrow = frameAt(page, "navbar-basic", 390);
  const wide = frameAt(page, "navbar-basic", 1440);
  expect((await countLabels(narrow, labels)).actions).toEqual({ "Open menu": 1, "Close menu": 0, "Not a label": 0 });
  expect((await countLabels(wide, labels)).actions).toEqual({ "Open menu": 0, "Close menu": 0, "Not a label": 0 });
  const rest = await signatureOf(narrow);
  const wideRest = await signatureOf(wide);
  await shownButton(narrow, "Open menu").click();
  await expect.poll(() => signatureOf(narrow)).not.toBe(rest);
  expect((await countLabels(narrow, labels)).actions).toEqual({ "Open menu": 0, "Close menu": 1, "Not a label": 0 });
  expect(await signatureOf(wide)).toBe(wideRest);
  // A frame between two steps: made 640 wide, the tablet frame lays out as a phone does.
  const middle = frameAt(page, "navbar-basic", 640);
  expect((await countLabels(middle, labels)).actions["Open menu"]).toBe(0);
  await setFrameWidth(middle, 640);
  expect((await countLabels(middle, labels)).actions["Open menu"]).toBe(1);
  await setFrameWidth(middle, null);
  expect((await countLabels(middle, labels)).actions["Open menu"]).toBe(0);
});

/*
 * The one layout the loops cannot read from labels: feature-zigzag changes
 * the side of its picture from row to row while a row is a row, and puts it
 * after the words once the row stacks. The template draws each picture with
 * three elements and shows one of them, so each width also counts the
 * pictures a reader meets. The rows come from the template's own state,
 * however many it ships with.
 */
interface ZigzagRow {
  title: string;
  image: string;
  text?: string;
  points?: string[];
  pictureFirst?: boolean;
}

function zigzagRows(): ZigzagRow[] {
  const rows = findTemplate("feature-zigzag")?.fragment.state?.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("feature-zigzag has no rows in its state.");
  return rows as ZigzagRow[];
}

/** The last words of a row a reader meets before a picture drawn after them: its last point, its sentence, or its title. */
function lastWords(frame: Locator, row: ZigzagRow): Locator {
  const last = row.points?.at(-1) ?? row.text;
  return last === undefined || last.trim() === "" ? frame.getByRole("heading", { name: row.title, exact: true }) : frame.getByText(last, { exact: true });
}

async function boxOf(locator: Locator, what: string) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} is not drawn.`);
  return box;
}

test("should draw each zigzag row's picture once, beside the words on changing sides while the row is a row, and after the words once it stacks", async ({ page, isMobile }) => {
  test.skip(isMobile, "the frames are the same widths in every project; once is enough");
  const rows = zigzagRows();
  // Both sides must be in the shipped rows, or the side check below proves nothing for one of them.
  expect(rows.some((row) => row.pictureFirst === true), "a row with its picture first").toBe(true);
  expect(rows.some((row) => row.pictureFirst !== true), "a row with its picture last").toBe(true);
  await open(page, "template=feature-zigzag");
  for (const width of readWidths) {
    const frame = frameAt(page, "feature-zigzag", width);
    if (width === 640) await setFrameWidth(frame, 640);
    await frame.scrollIntoViewIfNeeded();
    const counts = await countLabels(frame, { actions: [], pictures: rows.map((row) => row.image) });
    expect(counts.pictures, `pictures a reader meets at ${String(width)}`).toEqual(Object.fromEntries(rows.map((row) => [row.image, 1])));
    for (const row of rows) {
      const where = `"${row.title}" at ${String(width)}`;
      const title = await boxOf(frame.getByRole("heading", { name: row.title, exact: true }), `the title of ${where}`);
      const image = await boxOf(frame.getByRole("img", { name: row.image, exact: true }), `the picture of ${where}`);
      if (width >= 768) {
        // A row: the picture is beside the words (they overlap in height), on the side the row asks for.
        expect(image.x < title.x ? "left" : "right", `the picture's side in ${where}`).toBe(row.pictureFirst === true ? "left" : "right");
        expect(image.y, `the picture of ${where} starts above the end of its title`).toBeLessThan(title.y + title.height);
        expect(image.y + image.height, `the picture of ${where} ends below the start of its title`).toBeGreaterThan(title.y);
      } else {
        // Stacked: the words come first, whichever side the picture takes in a row.
        const words = await boxOf(lastWords(frame, row), `the last words of ${where}`);
        expect(title.y, `the title of ${where} comes before its picture`).toBeLessThan(image.y);
        expect(image.y, `the picture of ${where} comes after its last words`).toBeGreaterThanOrEqual(words.y + words.height);
      }
    }
    if (width === 640) await setFrameWidth(frame, null);
  }
});
