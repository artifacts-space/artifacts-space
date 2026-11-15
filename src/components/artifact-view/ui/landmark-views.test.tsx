import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatLongDay, monthOfDay, parseIsoDate } from "@/lib/ui/calendar-dates";
import { calendarEntries } from "@/lib/ui/calendar-model";
import { uiComponentNames, type UiComponentName } from "@/lib/ui/catalog";
import { componentFixtures, fixtureSpec } from "@/lib/ui/fixtures/components";

import { ArtifactView } from "../artifact-view";

import { MonthGrid } from "./calendar-month";

/*
 * A view must not mark a part of itself as a landmark. One screen is often
 * on a page more than once (a canvas shows it in three frames, the template
 * page at three widths), and then the page lists three landmarks with one
 * name, which axe reports as `landmark-unique` and a screen reader lists as
 * three identical stops. A named group keeps the name without the landmark
 * (scroll-stop.ts, the Board's columns, the Table's frame, an open Accordion
 * panel).
 */

/** Elements that are landmarks whether they are named or not. */
const alwaysLandmarks: ReadonlySet<string> = new Set(["nav", "aside", "main", "search"]);

/** Elements that are landmarks only when they are named: an unnamed section or form is no stop for a screen reader, and axe does not count it. */
const namedLandmarks: ReadonlySet<string> = new Set(["section", "form"]);

const landmarkRole = /\srole="(?:region|navigation|banner|contentinfo|complementary|search|form|main)"/;
const named = /\s(?:aria-label|aria-labelledby|title)="[^"]+"/;
/** Out of the accessibility tree, with everything inside it. */
const hides = /\s(?:hidden=""|aria-hidden="true")/;

/** An opening or closing tag: React escapes `<` and `>` in text and in attribute values, so every match is a real tag. */
const anyTag = /<(\/?)([a-z][a-z0-9-]*)((?:\s[^>]*)?)>/gi;
const voidTags: ReadonlySet<string> = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function isLandmark(name: string, attributes: string): boolean {
  if (alwaysLandmarks.has(name) || landmarkRole.test(attributes)) return true;
  return namedLandmarks.has(name) && named.test(attributes);
}

/** An element that is open at some point of the markup, and whether it is hidden, itself or by one around it. */
interface OpenElement {
  name: string;
  hidden: boolean;
}

/** Closes the nearest open element of this name, and everything opened inside it. */
function close(open: OpenElement[], name: string) {
  const at = open.map((element) => element.name).lastIndexOf(name);
  if (at >= 0) open.length = at;
}

const staysOpen = (name: string, attributes: string) => !attributes.endsWith("/") && !voidTags.has(name);

/**
 * The opening tags of the landmarks a reader of the markup meets. One that
 * is hidden, or inside something hidden (`hidden`, or `aria-hidden="true"`),
 * is left out: it is not in the accessibility tree.
 */
function landmarksIn(html: string): string[] {
  const found: string[] = [];
  const open: OpenElement[] = [];
  for (const [tag, closing, rawName = "", attributes = ""] of html.matchAll(anyTag)) {
    const name = rawName.toLowerCase();
    if (closing === "/") {
      close(open, name);
      continue;
    }
    const hidden = open.some((element) => element.hidden) || hides.test(attributes);
    if (!hidden && isLandmark(name, attributes)) found.push(tag);
    if (staysOpen(name, attributes)) open.push({ name, hidden });
  }
  return found;
}

/**
 * Views that still draw a landmark, each with why it is left for now. The
 * test fails for any other, so a new view cannot add one unseen. Remove a
 * name here when its view becomes a named group. None is left.
 */
const knownLandmarks: Partial<Record<UiComponentName, string>> = {};

describe("landmarks in the views", () => {
  const offenders = () =>
    uiComponentNames.filter((name) =>
      componentFixtures[name].some((fixture) => landmarksIn(renderToStaticMarkup(<ArtifactView kind="ui" content={JSON.stringify(fixtureSpec(name, fixture))} title="Test" />)).length > 0),
    );

  it("should draw no landmark in any component fixture, apart from the views listed with a reason", () => {
    expect(offenders().filter((name) => knownLandmarks[name] === undefined)).toEqual([]);
  });

  it("should list a view with a reason only while its fixtures still draw a landmark", () => {
    const drawing = new Set<string>(offenders());
    expect(Object.keys(knownLandmarks).filter((name) => !drawing.has(name))).toEqual([]);
  });

  it("should find a named section, a nav, and a region, so the check above can fail", () => {
    expect(landmarksIn('<section aria-label="Steps"><ol></ol></section>')).toHaveLength(1);
    expect(landmarksIn('<nav class="x"></nav><div role="region" aria-labelledby="a"></div>')).toHaveLength(2);
    expect(landmarksIn('<section class="plain"></section>')).toEqual([]);
  });

  it("should count a form as a landmark only when it is named", () => {
    expect(landmarksIn('<form class="grid gap-4" novalidate=""><input type="text" name="email"/></form>')).toEqual([]);
    expect(landmarksIn('<form aria-label="Sign in" novalidate=""></form>')).toEqual(['<form aria-label="Sign in" novalidate="">']);
    expect(landmarksIn('<h2 id="t">Sign in</h2><form aria-labelledby="t"></form>')).toHaveLength(1);
    expect(landmarksIn('<form title="Sign in"></form>')).toHaveLength(1);
    expect(landmarksIn('<form aria-label=""></form>')).toEqual([]);
  });

  it("should skip a landmark that is hidden, or inside something hidden, and find the next one after it", () => {
    expect(landmarksIn('<section id="p" aria-label="Selected day" hidden=""></section>')).toEqual([]);
    expect(landmarksIn('<div aria-hidden="true"><nav><a href="#a">A</a></nav></div>')).toEqual([]);
    expect(landmarksIn('<div hidden=""><div><form aria-label="Search"><input type="search"/><br></form></div></div>')).toEqual([]);
    expect(landmarksIn('<div aria-hidden="true"><svg><path d="M0 0"/></svg><nav></nav></div><nav class="shown"></nav>')).toEqual(['<nav class="shown">']);
    expect(landmarksIn('<div aria-hidden="false" data-hidden=""><nav></nav></div>')).toHaveLength(1);
  });
});

describe("Steps", () => {
  const steps = (props: Record<string, unknown>) =>
    renderToStaticMarkup(<ArtifactView kind="ui" content={JSON.stringify({ version: 1, root: "e", elements: { e: { type: "Steps", props } } })} title="Test" />);

  it("should be a group named by its title, and never a section, when it has a title", () => {
    const html = steps({ title: "Set up the project", items: [{ title: "Install" }, { title: "Run" }] });
    expect(html).toContain('<div role="group" class="min-w-0 space-y-3" aria-label="Set up the project">');
    expect(html).not.toContain("<section");
    expect(landmarksIn(html)).toEqual([]);
  });

  it("should be a group named Steps when it has no title", () => {
    expect(steps({ items: [{ title: "Install" }] })).toContain('<div role="group" class="min-w-0 space-y-3" aria-label="Steps">');
  });
});

/*
 * The panel under a month grid lists the events of a day a reader pressed.
 * No fixture draws it open, since it opens on a press, so the grid is drawn
 * here with a day already selected.
 */
describe("the Calendar's panel for a pressed day", () => {
  const day = parseIsoDate("2026-11-12") ?? 0;
  const entries = calendarEntries(Array.from({ length: 5 }, (_, index) => ({ title: `Interview ${String(index + 1)}`, start: "2026-11-12" })), undefined);
  const grid = (selected: number | null) =>
    renderToStaticMarkup(<MonthGrid month={monthOfDay(day)} weekStart={0} entries={entries} selected={selected} panelId="day-panel" onSelect={() => undefined} />);

  it("should be a group named for the day, and never a landmark, when a day is selected", () => {
    const html = grid(day);
    expect(html).toContain(`<div role="group" id="day-panel" aria-label="Events on ${formatLongDay(day)}"`);
    expect(html).not.toContain("<section");
    expect(landmarksIn(html)).toEqual([]);
  });

  it("should stay the panel its button controls when a day is selected", () => {
    const html = grid(day);
    expect(html).toContain('aria-expanded="true" aria-controls="day-panel"');
    expect(html.split('id="day-panel"')).toHaveLength(2);
  });

  it("should be hidden, with nothing inside, when no day is selected", () => {
    const html = grid(null);
    expect(html).toContain('<div role="group" id="day-panel" aria-label="Selected day" hidden=""');
    expect(html).toContain('aria-expanded="false" aria-controls="day-panel"');
    expect(landmarksIn(html)).toEqual([]);
  });
});
