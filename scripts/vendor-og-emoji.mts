/**
 * Builds src/app/og/emoji/fluent-emoji-flat.json.gz, the emoji artwork that
 * link-preview images draw page icons with. Source: Microsoft Fluent Emoji
 * Flat (MIT), as packaged by @iconify-json/fluent-emoji-flat@1.2.6. Run it
 * against an unpacked copy of that package:
 *
 *   npm pack @iconify-json/fluent-emoji-flat@1.2.6 && tar xzf iconify-json-fluent-emoji-flat-1.2.6.tgz
 *   node scripts/vendor-og-emoji.mts ./package
 *
 * The output maps a codepoint key (lowercase hex joined with "-", without
 * U+FE0F) to a complete 32×32 SVG document. Nothing is fetched at render.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

interface IconifyIcon { body: string; height?: number }
interface IconifyAlias { parent: string; hFlip?: boolean }
interface IconifySet { icons: Record<string, IconifyIcon>; aliases?: Record<string, IconifyAlias>; width?: number; height?: number }

const source = process.argv[2];
if (!source) throw new Error("Pass the unpacked package folder.");
const set = JSON.parse(readFileSync(join(source, "icons.json"), "utf8")) as IconifySet;
const chars = JSON.parse(readFileSync(join(source, "chars.json"), "utf8")) as Record<string, string>;
const size = set.width ?? 32;

function svgFor(name: string): string | null {
  const alias = set.aliases?.[name];
  const icon = set.icons[alias?.parent ?? name];
  if (!icon) return null;
  const height = icon.height ?? set.height ?? size;
  const body = alias?.hFlip ? `<g transform="translate(${String(size)} 0) scale(-1 1)">${icon.body}</g>` : icon.body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(size)} ${String(height)}">${body}</svg>`;
}

const out: Record<string, string> = {};
for (const [codepoints, name] of Object.entries(chars)) {
  const key = codepoints.split("-").filter((part) => part !== "fe0f").join("-");
  const svg = svgFor(name);
  if (svg) out[key] = svg;
}
writeFileSync("src/app/og/emoji/fluent-emoji-flat.json.gz", gzipSync(JSON.stringify(out), { level: 9 }));
console.log(`Wrote ${String(Object.keys(out).length)} emoji.`);
