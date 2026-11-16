/**
 * The ready rule of a capture box: when its drawing is what a reader would
 * see. The theme's font stylesheets have loaded, the fonts in use have
 * loaded, every picture is decoded, no diagram is still being drawn, and
 * two frames of layout have run (for views that measure themselves). Every
 * wait is on an event or a mark; one deadline bounds them all.
 */

/** How long a box may take to become ready. After it, the host draws what is there and marks the capture partial. */
export const readyDeadlineMs = 10_000;

/** What the ready rule found. */
export interface BoxReadiness {
  /** False when the deadline passed first. */
  settled: boolean;
  /** True when a picture in the box could not be decoded. */
  pictureFailed: boolean;
}

/** Resolves on the next animation frame. Frames stop in a hidden tab, so callers bound it with the deadline. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => { requestAnimationFrame(() => { resolve(); }); });
}

function stylesheetLoaded(href: string): Promise<void> {
  const link = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].find((candidate) => candidate.getAttribute("href") === href);
  if (!link || link.sheet) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { resolve(); };
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
  });
}

/** Decodes every picture in the box. True when one failed. */
async function decodePictures(box: HTMLElement): Promise<boolean> {
  const results = await Promise.all(
    [...box.querySelectorAll("img")].map(async (image) => {
      try {
        await image.decode();
        return image.naturalWidth > 0;
      } catch {
        return false;
      }
    }),
  );
  return results.includes(false);
}

const drawingDiagram = '[data-diagram-state="drawing"]';

/** Resolves once no diagram in the box is still being drawn: a mark the diagram views set, watched for changes. */
function diagramsDrawn(box: HTMLElement): Promise<void> {
  if (!box.querySelector(drawingDiagram)) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (box.querySelector(drawingDiagram)) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-diagram-state"] });
  });
}

async function settle(box: HTMLElement, stylesheets: readonly string[], found: { pictureFailed: boolean }): Promise<void> {
  await Promise.all(stylesheets.map(stylesheetLoaded));
  // One frame of layout asks for the fonts the text uses; then they load.
  await nextFrame();
  await document.fonts.ready;
  found.pictureFailed = await decodePictures(box);
  await diagramsDrawn(box);
  await document.fonts.ready;
  await nextFrame();
  await nextFrame();
}

/**
 * Waits until the box is ready to draw, or until the deadline. `stylesheets`
 * are the theme's font stylesheet URLs, which the theme scope adds to the
 * page's head.
 */
export async function waitUntilReady(box: HTMLElement, stylesheets: readonly string[], deadlineMs: number = readyDeadlineMs): Promise<BoxReadiness> {
  const found = { pictureFailed: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<false>((resolve) => { timer = setTimeout(() => { resolve(false); }, deadlineMs); });
  try {
    const settled = await Promise.race([settle(box, stylesheets, found).then(() => true as const), deadline]);
    return { settled, pictureFailed: found.pictureFailed };
  } catch {
    return { settled: false, pictureFailed: found.pictureFailed };
  } finally {
    clearTimeout(timer);
  }
}
