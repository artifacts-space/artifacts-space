import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { appFlowCanvas, brokenFrameCanvas, emptyCanvas, largeCanvas, placedCanvas, siteMockupCanvas } from "@/lib/canvas/fixtures";
import { canvasLimits, frameSizes } from "@/lib/canvas/limits";
import { CANVAS_VERSION } from "@/lib/canvas/version";
import { findTemplate } from "@/lib/ui/templates/index";
import { attachFragment, instantiateTemplate, templateAsSpec, templatePageKey } from "@/lib/ui/templates/instantiate";
import type { UiTemplate } from "@/lib/ui/templates/types";

/** The canvases the fixture page can show, by `?fixture=` name. */
export const canvasFixtureNames = ["site", "flow", "placed", "empty", "broken", "unreadable", "large", "screens"] as const;
export type CanvasFixtureName = (typeof canvasFixtureNames)[number];

function template(id: string): UiTemplate {
  const found = findTemplate(id);
  if (!found) throw new Error(`The canvas fixture needs the template "${id}".`);
  return found;
}

/**
 * One screen in three frames, as an agent lays a page out at three widths:
 * a navbar and a list of questions with the first one open, built from
 * section templates. Every named part of the screen is on the page three
 * times, so anything a view marks as a landmark would be three landmarks
 * with one name.
 */
function repeatedScreenCanvas() {
  const screen = attachFragment(templateAsSpec(template("navbar-basic")), instantiateTemplate(template("faq-accordion-centered")), { parent: templatePageKey });
  const frames = [
    { id: "screen-desktop", name: "Home, desktop", width: frameSizes.desktop },
    { id: "screen-tablet", name: "Home, tablet", width: frameSizes.tablet },
    { id: "screen-phone", name: "Home, phone", width: frameSizes.phone },
  ];
  return { version: CANVAS_VERSION, frames: frames.map((frame) => ({ ...frame, padding: "none", spec: screen })) };
}

const fixtures: Record<CanvasFixtureName, { title: string; content: string }> = {
  site: { title: "One page at three sizes, and its top edge to edge", content: JSON.stringify(siteMockupCanvas) },
  flow: { title: "An app flow", content: JSON.stringify(appFlowCanvas) },
  placed: { title: "Two rows, placed by hand", content: JSON.stringify(placedCanvas) },
  empty: { title: "An empty canvas", content: JSON.stringify(emptyCanvas) },
  broken: { title: "One frame that works, two that do not", content: JSON.stringify(brokenFrameCanvas) },
  unreadable: { title: "A canvas that cannot be read", content: '{ "version": 1, "frames": "none" }' },
  large: { title: "A full board", content: JSON.stringify(largeCanvas(canvasLimits.maxFrames)) },
  screens: { title: "One screen of section templates in three frames", content: JSON.stringify(repeatedScreenCanvas()) },
};

/**
 * Development only: one canvas in a column as wide as the artifact page's,
 * with text above and a tall block below so the page scrolls past the board.
 * The canvas e2e tests read it.
 */
export function CanvasFixture({ name }: { name: CanvasFixtureName }) {
  const fixture = fixtures[name];
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
      <header className="flex flex-wrap items-center gap-3 py-4">
        <h1 className="text-base font-medium">Canvas fixture</h1>
        <span className="text-xs text-muted-foreground">{fixture.title} · development only</span>
        <div className="ml-auto"><ThemeSwitcher /></div>
      </header>
      <ArtifactView kind="canvas" content={fixture.content} title={fixture.title} />
      <p data-fixture-below="" className="mt-6 h-[120vh] text-md text-muted-foreground">The page continues below the canvas, so a reader can always scroll past it.</p>
    </main>
  );
}
