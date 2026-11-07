/*
 * Page icons in artifact link previews. Tabler icons draw as inline SVG
 * (Satori renders their forwardRef components). Emoji draw from Microsoft
 * Fluent Emoji Flat (MIT, license beside the file), vendored as one gzipped
 * map in src/app/og/emoji and read from disk on the first emoji preview, so
 * nothing is fetched while rendering. Uploaded image icons are left out:
 * the card then looks as it did before icons.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { z } from "zod";

import { tablerIconComponents } from "@/components/artifact-icon/tabler-icons";
import { parseArtifactIcon, type TablerIconName } from "@/lib/artifact-icons";

import { OG_TEXT } from "./theme";

/** Side of the icon above the kind label, in px. */
export const OG_ICON_SIZE = 64;

/** What a preview draws for an icon. */
export type OgIcon = { type: "tabler"; name: TablerIconName } | { type: "image"; src: string };

const emojiArtSchema = z.record(z.string(), z.string().startsWith("<svg "));

let emojiArt: ReadonlyMap<string, string> | null = null;

/** The vendored emoji map, parsed once per server instance (about 8 MB of SVG text, 1.1 MB on disk). */
function loadEmojiArt(): ReadonlyMap<string, string> {
  emojiArt ??= new Map(
    Object.entries(emojiArtSchema.parse(JSON.parse(gunzipSync(readFileSync(join(process.cwd(), "src/app/og/emoji/fluent-emoji-flat.json.gz"))).toString("utf8")))),
  );
  return emojiArt;
}

/** The map key for an emoji: lowercase hex code points joined with "-", without U+FE0F. */
export function emojiKey(emoji: string): string {
  const points: string[] = [];
  for (const char of emoji) {
    const hex = char.codePointAt(0)?.toString(16) ?? "";
    if (hex && hex !== "fe0f") points.push(hex);
  }
  return points.join("-");
}

/** The emoji's artwork as a data URL, or null when the set has none (Fluent has no flags, for one). */
export function emojiImage(emoji: string): string | null {
  const svg = loadEmojiArt().get(emojiKey(emoji));
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` : null;
}

/** What to draw for a stored icon, or null to keep the card as it was. */
export function ogIconFor(icon: string | null | undefined): OgIcon | null {
  const parsed = parseArtifactIcon(icon);
  if (parsed?.type === "tabler") return { type: "tabler", name: parsed.name };
  if (parsed?.type !== "emoji") return null;
  const src = emojiImage(parsed.emoji);
  return src ? { type: "image", src } : null;
}

/** The icon above the kind label in an artifact preview. */
export function OgIconMark({ icon }: { icon: OgIcon }) {
  if (icon.type === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img> only
    return <img src={icon.src} alt="" width={OG_ICON_SIZE} height={OG_ICON_SIZE} />;
  }
  const Glyph = tablerIconComponents[icon.name];
  return <Glyph size={OG_ICON_SIZE} color={OG_TEXT} stroke={1.75} />;
}
