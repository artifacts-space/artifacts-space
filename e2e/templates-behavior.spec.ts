import type { Locator, Page } from "@playwright/test";

import { actionLabels, pictureLabels, pressButtons, type PressButton } from "../src/lib/ui/templates/behavior";
import type { TemplateFrameWidth } from "../src/lib/ui/templates/frames";
import { findTemplate, templateCategoriesInUse, templatesIn } from "../src/lib/ui/templates/index";
import type { TemplateCategory, UiTemplate } from "../src/lib/ui/templates/types";

import { countLabels, setFrameWidth, shownButton, signatureOf, type LabelCounts } from "./support/template-frames";
import { endFrames, mostOf, readingPlan, widthProblems, type ReadingPlan, type WidthReading } from "./support/template-readings";
import { expect, test } from "./support/test";

/*
 * What a reader can do in every section template, at every width, with no
 * list written by hand. The buttons that change state, and the label of
 * every link, button, and picture, are read from each template's fragment
 * (src/lib/ui/templates/behavior.ts). Where a template is read comes from
 * its viewport, from the record the page draws its frames by
 * (templateFrameWidths; readingPlan in support/template-readings.ts): a
 * fluid template in a 1440, a 768, and a 390 frame, and in the 768 frame
 * made 640 wide, which sit on either side of every step a block changes at
 * (576, 672, and 896 pixels); a wide template in its two frames; a phone
 * template in its one.
 *
 * For each template the loop checks:
 * - a press shows or changes something in its own frame only, and the
 *   button that undoes it brings the frame back;
 * - a press nothing undoes (a form's send, a banner's close, a push to a
 *   list or a remove from one) changes its own frame only; the restore is
 *   left out, and the test's annotations say for which button and why;
 * - every link and button a reader can reach in the widest reading can be
 *   reached in each narrower one, at rest or after opening a panel;
 * - no link, button, or picture is drawn more often between the two ends
 *   than at either end, which is what hide steps that differ produce.
 *
 * The frames are the same widths in every project, so this runs once, on
 * the desktop; the phone project keeps the drawing, overflow, and axe checks
 * of templates.spec.ts.
 */

const categories = templateCategoriesInUse();

/**
 * Links and buttons a template shows in its widest frame and, on purpose,
 * not at a narrower width, each with why. Keep it empty when you can: a reader on a
 * phone should reach what a reader on a desktop does.
 */
const leftOutWhenNarrow: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "navbar-mega-menu": { Product: "it only opens the panel, and in a narrow frame the menu button opens the same panel" },
};

const section = (page: Page, id: string) => page.locator(`[data-template="${id}"]:visible`);

/** One of the frames the page draws for a template, by its width. */
const frameAt = (page: Page, id: string, frame: number) => section(page, id).locator(`[data-template-frame="${String(frame)}"]`);

async function open(page: Page, query: string) {
  await page.goto(`/dev/templates?${query}`);
  await expect(page.locator("[data-templates-ready]")).toBeAttached({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** The signatures of every frame of a template except the one a reading is made in, to show a press stayed in its own frame. */
async function otherFrames(page: Page, plan: Plan, read: WidthReading): Promise<string[]> {
  const others = plan.reading.frames.filter((frame) => frame !== read.frame);
  return Promise.all(others.map((frame) => signatureOf(frameAt(page, plan.template.id, frame))));
}

interface Plan {
  template: UiTemplate;
  /** Where the template is read: the frames the page draws for its viewport, and each reading. */
  reading: ReadingPlan;
  labels: { actions: string[]; pictures: string[] };
  /** Buttons whose press changes the frame and that another button undoes. */
  reveals: PressButton[];
  /** Buttons whose press no other undoes, each with why (`oneWay`): a form's send, a banner's close, a push to a list. */
  oneWay: PressButton[];
  /** Every label a state-changing button has; each must be pressed in some frame. */
  mustPress: string[];
}

function byLabel(buttons: readonly PressButton[]): PressButton[] {
  return [...new Map(buttons.map((button) => [button.label, button])).values()];
}

function planFor(template: UiTemplate): Plan {
  const { buttons } = pressButtons(template);
  return {
    template,
    reading: readingPlan(template.viewport),
    labels: { actions: actionLabels(template).labels, pictures: pictureLabels(template) },
    reveals: byLabel(buttons.filter((button) => button.restoredBy.length > 0)),
    oneWay: byLabel(buttons.filter((button) => button.oneWay !== null)),
    mustPress: [...new Set(buttons.map((button) => button.label))],
  };
}

/** Presses `button` and checks that the frame no longer shows what it showed at `rest`, and that no other frame changed. */
async function pressAndExpectChange(page: Page, plan: Plan, read: WidthReading, frame: Locator, button: PressButton, rest: string): Promise<void> {
  const before = await otherFrames(page, plan, read);
  await shownButton(frame, button.label).first().click();
  await expect.poll(() => signatureOf(frame), { message: `pressing "${button.label}" at ${String(read.width)} changes what the frame shows` }).not.toBe(rest);
  expect(await otherFrames(page, plan, read), `pressing "${button.label}" at ${String(read.width)} changes that frame only`).toEqual(before);
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

/** Reads a template at one width, at rest and after each press that another button undoes, pressing and undoing as it goes. */
async function readFrame(page: Page, plan: Plan, read: WidthReading, pressed: Set<string>): Promise<LabelCounts> {
  const frame = frameAt(page, plan.template.id, read.frame);
  await frame.scrollIntoViewIfNeeded();
  const rest = await signatureOf(frame);
  const readings = [await countLabels(frame, plan.labels)];
  for (const button of plan.reveals) {
    if ((await shownButton(frame, button.label).count()) === 0) continue;
    await pressAndExpectChange(page, plan, read, frame, button, rest);
    readings.push(await countLabels(frame, plan.labels));
    const undo = await pressFirstShown(frame, button.restoredBy, `after "${button.label}" at ${String(read.width)}, nothing puts the frame back`);
    await expect.poll(() => signatureOf(frame), { message: `"${undo}" at ${String(read.width)} brings back what "${button.label}" changed` }).toBe(rest);
    pressed.add(button.label).add(undo);
  }
  return mostOf(readings);
}

/** Presses, in one frame, each of `buttons` that shows: its frame changes and no other does. Returns the ones that did not show. */
async function pressShown(page: Page, plan: Plan, width: TemplateFrameWidth, buttons: readonly PressButton[], pressed: Set<string>): Promise<PressButton[]> {
  const frame = frameAt(page, plan.template.id, width);
  const hidden: PressButton[] = [];
  for (const button of buttons) {
    if ((await shownButton(frame, button.label).count()) === 0) {
      hidden.push(button);
      continue;
    }
    await frame.scrollIntoViewIfNeeded();
    await pressAndExpectChange(page, plan, { width, frame: width }, frame, button, await signatureOf(frame));
    pressed.add(button.label);
  }
  return hidden;
}

/**
 * Presses each button nothing undoes, last, in the widest and the narrowest
 * frame the template has. The restore is left out, and the test notes for
 * which button and why. One press can show the next (a push draws the row a
 * remove sits in), so a frame is gone over until no button that is left
 * shows.
 */
async function pressOneWay(page: Page, plan: Plan, pressed: Set<string>) {
  for (const width of endFrames(plan.reading)) {
    let left: readonly PressButton[] = plan.oneWay;
    let before = left.length + 1;
    while (left.length > 0 && left.length < before) {
      before = left.length;
      left = await pressShown(page, plan, width, left, pressed);
    }
  }
  for (const button of plan.oneWay.filter((one) => pressed.has(one.label))) {
    test.info().annotations.push({ type: "restore left out", description: `${plan.template.id}, "${button.label}": ${button.oneWay ?? ""}` });
  }
}

/** Fails with words when the page does not draw the frames the plan reads, instead of a locator that times out later. */
async function expectFrames(page: Page, plan: Plan) {
  const drawn = await section(page, plan.template.id).locator("[data-template-frame]").evaluateAll((frames) => frames.map((frame) => Number(frame.getAttribute("data-template-frame"))));
  expect(drawn, `the frames the page draws for a ${plan.template.viewport} template`).toEqual([...plan.reading.frames]);
}

async function expectBehavior(page: Page, template: UiTemplate) {
  const plan = planFor(template);
  await expectFrames(page, plan);
  const pressed = new Set<string>();
  const readings = new Map<number, LabelCounts>();
  for (const read of plan.reading.reads) {
    const frame = frameAt(page, template.id, read.frame);
    if (read.width !== read.frame) await setFrameWidth(frame, read.width);
    readings.set(read.width, await readFrame(page, plan, read, pressed));
    if (read.width !== read.frame) await setFrameWidth(frame, null);
  }
  const problems = widthProblems(plan.reading, readings, leftOutWhenNarrow[template.id]);
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
  test(`should keep every ${category} template's links and buttons reachable and drawn once at every width it is made for, and undo what a press shows`, async ({ page, isMobile }) => {
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
  // The test needs all three frames, so it fails with words when its template stops being drawn in them.
  expect(readingPlan(findTemplate("navbar-basic")?.viewport ?? "phone").frames, "navbar-basic is drawn at all three widths").toEqual([1440, 768, 390]);
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
  const middle = frameAt(page, "navbar-basic", 768);
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

function zigzag(): { rows: ZigzagRow[]; reads: readonly WidthReading[] } {
  const template = findTemplate("feature-zigzag");
  const rows = template?.fragment.state?.rows;
  if (!template || !Array.isArray(rows) || rows.length === 0) throw new Error("feature-zigzag has no rows in its state.");
  return { rows: rows as ZigzagRow[], reads: readingPlan(template.viewport).reads };
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
  const { rows, reads } = zigzag();
  // Both sides must be in the shipped rows, or the side check below proves nothing for one of them.
  expect(rows.some((row) => row.pictureFirst === true), "a row with its picture first").toBe(true);
  expect(rows.some((row) => row.pictureFirst !== true), "a row with its picture last").toBe(true);
  await open(page, "template=feature-zigzag");
  for (const { width, frame: frameWidth } of reads) {
    const frame = frameAt(page, "feature-zigzag", frameWidth);
    if (width !== frameWidth) await setFrameWidth(frame, width);
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
    if (width !== frameWidth) await setFrameWidth(frame, null);
  }
});
