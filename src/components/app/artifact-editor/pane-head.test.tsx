import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { presetTheme, siteDefaultTheme } from "@/lib/themes/resolve";

import { headSurface, PaneHead, PinnedInPane } from "./pane-head";
import { surfaceClass } from "./preview-surface";
import { isSaveProblem } from "./save-status";

const ocean = presetTheme("ocean") ?? null;

describe("headSurface", () => {
  it("should be the body's surface, themed or not, so the title block and the body read as one page", () => {
    expect(ocean).not.toBeNull();
    for (const theme of [ocean, siteDefaultTheme(), null]) expect(headSurface(theme)).toBe(surfaceClass(theme));
    expect(headSurface(ocean)).not.toBe(headSurface(null));
  });
});

describe("PaneHead", () => {
  it("should put its rows in the artifact's theme without a box of its own, so they stay rows of the pane's scroll box", () => {
    const html = renderToStaticMarkup(<PaneHead theme={ocean}><p>Title</p></PaneHead>);
    expect(html).toMatch(/<div[^>]*class="[^"]*\bartifact-theme\b[^"]*\bcontents\b[^"]*"[^>]*style="[^"]*--background/);
    expect(html).toContain("<p>Title</p>");
  });
});

describe("PinnedInPane", () => {
  it("should stick to the top of the pane on the page's surface when pinned, from md up only", () => {
    const html = renderToStaticMarkup(<PinnedInPane theme={ocean} slot="detail-notices"><p>Saved by an agent</p></PinnedInPane>);
    expect(html).toContain('data-pinned="true"');
    expect(html).toMatch(/class="[^"]*md:sticky[^"]*md:top-0[^"]*"/);
    expect(html).toContain(headSurface(ocean));
    expect(html).not.toMatch(/class="(?:[^"]* )?sticky(?: [^"]*)?"/);
  });

  it("should take no box and leave its rows scrolling with the page when not pinned", () => {
    const html = renderToStaticMarkup(<PinnedInPane theme={ocean} pinned={false}><p>Edited by</p></PinnedInPane>);
    expect(html).toContain('class="contents"');
    expect(html).toContain('data-pinned="false"');
  });
});

describe("isSaveProblem", () => {
  it("should be true only for a save the person must act on", () => {
    expect(isSaveProblem({ kind: "failed", message: "Not saved." })).toBe(true);
    expect(isSaveProblem({ kind: "held", message: "Fix the JSON." })).toBe(true);
    expect(isSaveProblem({ kind: "idle" })).toBe(false);
    expect(isSaveProblem({ kind: "saving" })).toBe(false);
    expect(isSaveProblem({ kind: "saved", waitingForApproval: false })).toBe(false);
  });
});
