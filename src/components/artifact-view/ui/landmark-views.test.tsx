import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { uiComponentNames, type UiComponentName } from "@/lib/ui/catalog";
import { componentFixtures, fixtureSpec } from "@/lib/ui/fixtures/components";

import { ArtifactView } from "../artifact-view";

/*
 * A view must not mark a part of itself as a landmark. One screen is often
 * on a page more than once (a canvas shows it in three frames, the template
 * page at three widths), and then the page lists three landmarks with one
 * name, which axe reports as `landmark-unique` and a screen reader lists as
 * three identical stops. A named group keeps the name without the landmark
 * (scroll-stop.ts, the Board's columns, the Table's frame, an open Accordion
 * panel).
 */

/** Elements that are landmarks when they are named, or always. Hidden ones are skipped: they are not in the accessibility tree. */
const landmarkTags = [
  /<(?:nav|aside|main|form|search)\b[^>]*>/g,
  /<section\b[^>]*\baria-label(?:ledby)?="[^"]*"[^>]*>/g,
  /<[a-z0-9]+\b[^>]*\brole="(?:region|navigation|banner|contentinfo|complementary|search|form|main)"[^>]*>/g,
];

function landmarksIn(html: string): string[] {
  return landmarkTags.flatMap((pattern) => html.match(pattern) ?? []).filter((tag) => !/\bhidden=""/.test(tag));
}

/**
 * Views that still draw a landmark, each with why it is left for now. The
 * test fails for any other, so a new view cannot add one unseen. Remove a
 * name here when its view becomes a named group.
 */
const knownLandmarks: Partial<Record<UiComponentName, string>> = {
  Steps: "its list is a <section> named by its title (or \"Steps\"); two Steps with one title on a page are two landmarks with one name",
};

describe("landmarks in the views", () => {
  it("should draw no landmark in any component fixture, apart from the views listed with a reason", () => {
    const offenders = uiComponentNames.filter((name) =>
      componentFixtures[name].some((fixture) => landmarksIn(renderToStaticMarkup(<ArtifactView kind="ui" content={JSON.stringify(fixtureSpec(name, fixture))} title="Test" />)).length > 0),
    );
    expect(offenders.filter((name) => knownLandmarks[name] === undefined)).toEqual([]);
  });

  it("should find a named section, a nav, and a region, and skip a hidden one, so the check above can fail", () => {
    expect(landmarksIn('<section aria-label="Steps"><ol></ol></section>')).toHaveLength(1);
    expect(landmarksIn('<nav class="x"></nav><div role="region" aria-labelledby="a"></div>')).toHaveLength(2);
    expect(landmarksIn('<section id="p" aria-label="Selected day" hidden=""></section><section class="plain"></section>')).toEqual([]);
  });
});
