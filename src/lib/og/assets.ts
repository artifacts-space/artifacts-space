/*
 * Image layers for social preview images, read once at module scope. Paths
 * resolve from the project root, which is the working directory for
 * `next build` and the deployed functions. Each path is a literal so the
 * build traces only these files.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

/** Strata Ink backdrop: ink, dusk horizon strip, pixel band and the three pixel cards. 1200×630, no text. */
export const strataInkBackground = pngDataUrl(readFileSync(join(process.cwd(), "src/app/og/strata-ink.png")));

/** The planet logo, pre-scaled to 40×40 with hard pixel edges so nothing resamples it. */
export const planetIcon40 = pngDataUrl(readFileSync(join(process.cwd(), "src/app/og/planet-40.png")));

/** Strata Ink without the three pixel cards, for artifact previews that draw their own card. */
export const strataInkPlainBackground = pngDataUrl(readFileSync(join(process.cwd(), "src/app/og/strata-ink-plain.png")));

function arrayBufferOf(bytes: Buffer): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

/** Geist Mono Regular (SIL OFL 1.1, license beside the file) for code in artifact previews. */
export const geistMonoRegular = arrayBufferOf(readFileSync(join(process.cwd(), "src/app/og/fonts/GeistMono-Regular.ttf")));
