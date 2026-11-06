/**
 * Avatar hues. This is a deliberate exception to the rule that every color is
 * a CSS token in globals.css: these colors are data, not theme. Each person or
 * agent gets one hue (and its neighbour) from a stable hash of their id, so
 * the set must live where the hash can index it, on the server and the client
 * alike. Theme still applies: the avatar mixes each hue with the
 * `--avatar-ink` and `--avatar-tint-base` tokens, so the same hue reads on the
 * light and the dark palette.
 *
 * The ring starts at the logo planet's mid blue (#0868F5, sampled from
 * public/artifacts-space-icon.png) and walks the hue circle in OKLCH at a
 * similar lightness (0.56–0.68) and strong chroma, so every hue sits beside
 * the planet blues without clashing. Yellow is left out: at this lightness it
 * turns muddy. Order matters: an avatar's second color is a ring neighbour.
 *
 * Checked contrast (WCAG, pattern against its own tint): 3.3–4.6 on light,
 * 3.7–4.6 on dark.
 */
export const AVATAR_HUES = [
  { name: "planet", hex: "#0868F5" },
  { name: "violet", hex: "#8151DB" },
  { name: "magenta", hex: "#BC48BB" },
  { name: "rose", hex: "#D8488C" },
  { name: "coral", hex: "#E24947" },
  { name: "orange", hex: "#DB640E" },
  { name: "amber", hex: "#CA8907" },
  { name: "lime", hex: "#7CA215" },
  { name: "green", hex: "#2B9F4A" },
  { name: "teal", hex: "#019C86" },
  { name: "cyan", hex: "#099EAB" },
  { name: "azure", hex: "#0790CE" },
] as const;

export type AvatarHue = (typeof AVATAR_HUES)[number];
