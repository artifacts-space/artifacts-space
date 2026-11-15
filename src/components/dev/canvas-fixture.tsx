import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { appFlowCanvas, brokenFrameCanvas, emptyCanvas, largeCanvas, placedCanvas, siteMockupCanvas } from "@/lib/canvas/fixtures";
import { canvasLimits } from "@/lib/canvas/limits";

/** The canvases the fixture page can show, by `?fixture=` name. */
export const canvasFixtureNames = ["site", "flow", "placed", "empty", "broken", "unreadable", "large"] as const;
export type CanvasFixtureName = (typeof canvasFixtureNames)[number];

const fixtures: Record<CanvasFixtureName, { title: string; content: string }> = {
  site: { title: "One page at three sizes", content: JSON.stringify(siteMockupCanvas) },
  flow: { title: "An app flow", content: JSON.stringify(appFlowCanvas) },
  placed: { title: "Two rows, placed by hand", content: JSON.stringify(placedCanvas) },
  empty: { title: "An empty canvas", content: JSON.stringify(emptyCanvas) },
  broken: { title: "One frame that works, two that do not", content: JSON.stringify(brokenFrameCanvas) },
  unreadable: { title: "A canvas that cannot be read", content: '{ "version": 1, "frames": "none" }' },
  large: { title: "A full board", content: JSON.stringify(largeCanvas(canvasLimits.maxFrames)) },
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
