/*
 * Geist and Geist Mono for social preview images, the same faces the site
 * uses. The TTFs are copied unchanged from the geist@1.8.2 npm package and
 * committed beside their license (SIL Open Font License 1.1), which allows
 * redistribution. Reading them from disk keeps image rendering offline: no
 * font CDN can slow or break a build or a preview. Each path is a literal so
 * the build traces only these files.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type OgFontWeight = 400 | 500 | 600;

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: OgFontWeight;
  style: "normal";
}

function arrayBufferOf(bytes: Buffer): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

const geistMedium = arrayBufferOf(readFileSync(join(process.cwd(), "src/app/og/fonts/Geist-Medium.ttf")));
const geistSemiBold = arrayBufferOf(readFileSync(join(process.cwd(), "src/app/og/fonts/Geist-SemiBold.ttf")));
const geistMonoRegular = arrayBufferOf(readFileSync(join(process.cwd(), "src/app/og/fonts/GeistMono-Regular.ttf")));

/** The family name preview images set in `fontFamily` for sans text. */
export const OG_SANS_FAMILY = "Geist";

/** The family name preview images set in `fontFamily` for code. */
export const OG_MONO_FAMILY = "Geist Mono";

/** Geist Medium and SemiBold (600, the boldest weight images use), for every `ImageResponse`. */
export const ogSansFonts: readonly OgFont[] = [
  { name: OG_SANS_FAMILY, data: geistMedium, weight: 500, style: "normal" },
  { name: OG_SANS_FAMILY, data: geistSemiBold, weight: 600, style: "normal" },
];

/** Geist Mono Regular, for code in artifact previews. */
export const ogMonoFont: OgFont = { name: OG_MONO_FAMILY, data: geistMonoRegular, weight: 400, style: "normal" };
