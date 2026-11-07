/**
 * Vendors the theme fonts into public/fonts/v1/<id>/: the latin woff2 files
 * from Google Fonts, a small font.css per face (with a metric-matched
 * fallback face for sans and serif faces), and the face's OFL license. The
 * site then serves every theme font itself, and a page loads a face only
 * when its theme uses it (src/lib/themes/fonts.ts).
 *
 * Run it only to add a face or refresh the files, then bump the version
 * segment (v1) so cached copies are replaced, and update the file names and
 * byte sizes in src/lib/themes/fonts.ts from the printed manifest:
 *
 *   node scripts/vendor-fonts.mjs
 *
 * It needs network access, and it is never run by the build.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = process.cwd();
const require = createRequire(join(root, "package.json"));
/** @type {{ calculateSizeAdjustValues: (family: string) => { fallbackFont: string; ascent: number; descent: number; lineGap: number; sizeAdjust: number } }} */
const fontUtils = require("next/dist/server/font-utils");

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** @typedef {{ id: string; family: string; query: string; licenseDir: string; fallback: "sans" | "serif" | "mono" }} Face */

/** @type {Face[]} Every vendored face. Geist and Geist Mono come from next/font and are not listed. */
const faces = [
  { id: "inter", family: "Inter", query: "Inter:ital,wght@0,100..900;1,100..900", licenseDir: "inter", fallback: "sans" },
  { id: "roboto", family: "Roboto", query: "Roboto:ital,wght@0,100..900;1,100..900", licenseDir: "roboto", fallback: "sans" },
  { id: "work-sans", family: "Work Sans", query: "Work+Sans:ital,wght@0,100..900;1,100..900", licenseDir: "worksans", fallback: "sans" },
  { id: "dm-sans", family: "DM Sans", query: "DM+Sans:ital,wght@0,100..1000;1,100..1000", licenseDir: "dmsans", fallback: "sans" },
  { id: "manrope", family: "Manrope", query: "Manrope:wght@200..800", licenseDir: "manrope", fallback: "sans" },
  { id: "ibm-plex-sans", family: "IBM Plex Sans", query: "IBM+Plex+Sans:ital,wght@0,100..700;1,100..700", licenseDir: "ibmplexsans", fallback: "sans" },
  { id: "instrument-serif", family: "Instrument Serif", query: "Instrument+Serif", licenseDir: "instrumentserif", fallback: "serif" },
  { id: "fraunces", family: "Fraunces", query: "Fraunces:wght@100..900", licenseDir: "fraunces", fallback: "serif" },
  { id: "source-serif-4", family: "Source Serif 4", query: "Source+Serif+4:ital,wght@0,200..900;1,200..900", licenseDir: "sourceserif4", fallback: "serif" },
  { id: "jetbrains-mono", family: "JetBrains Mono", query: "JetBrains+Mono:wght@100..800", licenseDir: "jetbrainsmono", fallback: "mono" },
  { id: "ibm-plex-mono", family: "IBM Plex Mono", query: "IBM+Plex+Mono:wght@400;600", licenseDir: "ibmplexmono", fallback: "mono" },
];

/**
 * Fetches a URL as text, failing on any non-2xx answer.
 * @param {string} url
 * @param {Record<string, string>} [headers]
 */
async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
  return response.text();
}

/** @typedef {{ style: string; weight: string; src: string; range: string }} LatinBlock */

/**
 * The latin @font-face blocks of a Google Fonts stylesheet, upright first.
 * @param {string} css
 * @returns {LatinBlock[]}
 */
function latinBlocks(css) {
  /** @type {LatinBlock[]} */
  const blocks = [];
  const pattern = /\/\* latin \*\/\s*@font-face\s*\{([^}]*)\}/g;
  for (let match = pattern.exec(css); match; match = pattern.exec(css)) {
    const body = match[1] ?? "";
    /** @param {string} property */
    const read = (property) => new RegExp(`${property}:\\s*([^;]+);`).exec(body)?.[1]?.trim() ?? "";
    const src = /url\(([^)]+)\)/.exec(body)?.[1];
    if (!src) continue;
    blocks.push({ style: read("font-style"), weight: read("font-weight"), src, range: read("unicode-range") });
  }
  return blocks.sort((a, b) => Number(a.style !== "normal") - Number(b.style !== "normal"));
}

/**
 * A local fallback face sized to match `family`, so text does not jump when the web font arrives. None for mono faces.
 * @param {Face} face
 */
function fallbackFace(face) {
  if (face.fallback === "mono") return "";
  try {
    const metrics = fontUtils.calculateSizeAdjustValues(face.family);
    return `@font-face {\n  font-family: "${face.family} Fallback";\n  src: local("${metrics.fallbackFont}");\n  ascent-override: ${String(metrics.ascent)}%;\n  descent-override: ${String(metrics.descent)}%;\n  line-gap-override: ${String(metrics.lineGap)}%;\n  size-adjust: ${String(metrics.sizeAdjust)}%;\n}\n`;
  } catch {
    return "";
  }
}

/**
 * Downloads one face's files, writes its font.css and license, and returns its manifest entry.
 * @param {Face} face
 */
async function vendorFace(face) {
  const out = join(root, "public/fonts/v1", face.id);
  mkdirSync(out, { recursive: true });
  const blocks = latinBlocks(await fetchText(`https://fonts.googleapis.com/css2?family=${face.query}&display=swap`, { "User-Agent": userAgent }));
  if (blocks.length === 0) throw new Error(`No latin files for ${face.family}`);
  const rules = [];
  const files = [];
  for (const block of blocks) {
    const name = `${face.id}-${block.style}-${block.weight.replace(" ", "-")}.woff2`;
    const response = await fetch(block.src);
    if (!response.ok) throw new Error(`${block.src} answered ${String(response.status)}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(join(out, name), bytes);
    files.push({ file: name, style: block.style, weight: block.weight, bytes: bytes.length });
    rules.push(`@font-face {\n  font-family: "${face.family}";\n  font-style: ${block.style};\n  font-weight: ${block.weight};\n  font-display: swap;\n  src: url("${name}") format("woff2");\n  unicode-range: ${block.range};\n}\n`);
  }
  const header = `/* ${face.family}, latin subset, from Google Fonts. SIL Open Font License 1.1: see OFL.txt. */\n`;
  writeFileSync(join(out, "font.css"), header + rules.join("") + fallbackFace(face));
  writeFileSync(join(out, "OFL.txt"), await fetchText(`https://raw.githubusercontent.com/google/fonts/main/ofl/${face.licenseDir}/OFL.txt`));
  return { files, cssBytes: statSync(join(out, "font.css")).size, hasFallback: face.fallback !== "mono" };
}

/** @type {Record<string, Awaited<ReturnType<typeof vendorFace>>>} */
const manifest = {};
for (const face of faces) {
  manifest[face.id] = await vendorFace(face);
  console.error(`${face.id}: ${manifest[face.id]?.files.map((file) => `${file.file} (${String(file.bytes)} bytes)`).join(", ") ?? ""}`);
}
console.log(JSON.stringify(manifest, null, 2));
