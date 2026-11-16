import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { appFlowCanvas, brokenFrameCanvas, emptyCanvas, largeCanvas, placedCanvas, siteMockupCanvas } from "@/lib/canvas/fixtures";
import { canvasLimits, frameSizes } from "@/lib/canvas/limits";
import { CANVAS_VERSION } from "@/lib/canvas/version";
import { UI_SPEC_VERSION } from "@/lib/ui/version";
import { findTemplate } from "@/lib/ui/templates/index";
import { attachFragment, instantiateTemplate, templateAsSpec, templatePageKey } from "@/lib/ui/templates/instantiate";
import type { UiTemplate } from "@/lib/ui/templates/types";

import { CanvasCaptureFixture } from "./canvas-capture-fixture";
import { captureFixtureFiles } from "./capture-fixture-api";

/** The canvases the fixture page can show, by `?fixture=` name. */
export const canvasFixtureNames = ["site", "flow", "placed", "empty", "broken", "unreadable", "large", "screens", "pictures"] as const;
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

/**
 * One frame that shows two uploaded pictures and a file card, for the frame
 * capture checks: the capture host fetches a frame's pictures itself. Only
 * the capture fixture (`?capture=1`) knows these files; without it the frame
 * shows notices in their place.
 */
function picturesCanvas() {
  const [team, office] = captureFixtureFiles;
  const spec = {
    version: UI_SPEC_VERSION,
    root: "page",
    elements: {
      page: { type: "Stack", props: { gap: "md" }, children: ["title", "team", "office", "handbook"] },
      title: { type: "Heading", props: { text: "The team", level: 1 } },
      team: { type: "Image", props: { file: team?.id ?? "", alt: "The team at the offsite", ratio: "wide" } },
      office: { type: "Image", props: { file: office?.id ?? "", alt: "The office", ratio: "wide" } },
      handbook: { type: "File", props: { file: team?.id ?? "", label: "Team photo" } },
    },
  };
  return { version: CANVAS_VERSION, frames: [{ id: "team-tablet", name: "Team, tablet", width: frameSizes.tablet, spec }] };
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
  pictures: { title: "One frame with uploaded pictures", content: JSON.stringify(picturesCanvas()) },
};

/**
 * Development only: one canvas in a column as wide as the artifact page's,
 * with text above and a tall block below so the page scrolls past the board.
 * The canvas e2e tests read it. With `capture`, the page also mounts a
 * capture host that draws the frames through a stand-in API
 * (canvas-capture-fixture.tsx); without it there is no host.
 */
export function CanvasFixture({ name, capture = false }: { name: CanvasFixtureName; capture?: boolean }) {
  const fixture = fixtures[name];
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
      <header className="flex flex-wrap items-center gap-3 py-4">
        <h1 className="text-base font-medium">Canvas fixture</h1>
        <span className="text-xs text-muted-foreground">{fixture.title} · development only</span>
        <div className="ml-auto"><ThemeSwitcher /></div>
      </header>
      {capture ? <CanvasCaptureFixture title={fixture.title} content={fixture.content} /> : <ArtifactView kind="canvas" content={fixture.content} title={fixture.title} />}
      <p data-fixture-below="" className="mt-6 h-[120vh] text-md text-muted-foreground">The page continues below the canvas, so a reader can always scroll past it.</p>
    </main>
  );
}
