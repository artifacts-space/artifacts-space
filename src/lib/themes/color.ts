/**
 * Small, dependency-free CSS color math for themes: parse the four color
 * syntaxes themes accept (hex, rgb, hsl, oklch), convert through OKLab, and
 * compute WCAG contrast. Every parsed color is normalised to one canonical
 * `oklch(L C H)` string, so theme values that reach the DOM are always in a
 * shape this module wrote, never the text a person or agent typed.
 */

/** A color in OKLCH. `l` is 0 to 1, `c` is chroma (0 to about 0.4), `h` is degrees, `alpha` is 0 to 1. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

type Rgb = readonly [number, number, number];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits: number) => Number(value.toFixed(digits));

/** Hex: #rgb, #rgba, #rrggbb, #rrggbbaa. */
const hexPattern = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** A function color: name, then the inside of the parentheses. Only digits, signs, dots, %, commas, slashes, spaces, and "deg". */
const functionPattern = /^(rgba?|hsla?|oklch)\(([0-9.,%/+\-\sdeg]*)\)$/i;
const numberPattern = /^[+-]?(\d+\.?\d*|\.\d+)(%|deg)?$/;

interface Token {
  value: number;
  unit: "" | "%" | "deg";
}

function token(raw: string): Token | null {
  const match = numberPattern.exec(raw);
  if (!match) return null;
  const unit = match[2] === "%" || match[2] === "deg" ? match[2] : "";
  return { value: Number.parseFloat(raw), unit };
}

function tokensOf(text: string): Token[] | null {
  const parts = text.includes(",") ? text.split(",").map((part) => part.trim()) : text.trim().split(/\s+/);
  const tokens: Token[] = [];
  for (const part of parts) {
    const item = token(part);
    if (!item) return null;
    tokens.push(item);
  }
  return tokens;
}

/** Splits "r g b / a" or "r, g, b, a" into three channel tokens and an optional alpha token. */
function splitArgs(inside: string): { channels: Token[]; alpha: Token | null } | null {
  const [main = "", slashAlpha, extra] = inside.trim().split("/");
  const channels = extra === undefined ? tokensOf(main) : null;
  if (!channels) return null;
  if (slashAlpha !== undefined) {
    const alpha = token(slashAlpha.trim());
    return alpha && channels.length === 3 ? { channels, alpha } : null;
  }
  const commaAlpha = channels.length === 4 ? channels.pop() ?? null : null;
  return channels.length === 3 ? { channels, alpha: commaAlpha } : null;
}

const inRange = (value: number, min: number, max: number) => value >= min && value <= max;

/** A number or percentage, scaled to a plain number; null for an angle. */
function scaled(item: Token, percentScale: number, numberScale = 1): number | null {
  if (item.unit === "deg") return null;
  return item.unit === "%" ? (item.value / 100) * percentScale : item.value * numberScale;
}

/** A hue in degrees, wrapped to 0 to 360; null for a percentage. */
function hueOf(item: Token): number | null {
  return item.unit === "%" ? null : ((item.value % 360) + 360) % 360;
}

function alphaOf(item: Token | null): number | null {
  if (!item) return 1;
  const value = scaled(item, 1);
  return value !== null && inRange(value, 0, 1) ? value : null;
}

function parseHex(digits: string): { rgb: Rgb; alpha: number } {
  const full = digits.length <= 4 ? digits.replace(/./g, (digit) => digit + digit) : digits;
  const byte = (index: number) => Number.parseInt(full.slice(index * 2, index * 2 + 2), 16);
  return { rgb: [byte(0) / 255, byte(1) / 255, byte(2) / 255], alpha: full.length === 8 ? byte(3) / 255 : 1 };
}

function rgbChannel(item: Token): number | null {
  const value = scaled(item, 1, 1 / 255);
  return value !== null && inRange(value, 0, 1) ? value : null;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

function parseRgb(channels: Token[]): Rgb | null {
  const [r, g, b] = channels.map(rgbChannel);
  if (r == null || g == null || b == null) return null;
  return [r, g, b];
}

/** Saturation and lightness are percentages (a bare number is read as one too, as CSS Color 4 allows). */
function hslPercent(item: Token): number | null {
  const value = scaled(item, 1, 1 / 100);
  return value !== null && inRange(value, 0, 1) ? value : null;
}

function parseHsl([h, s, l]: Token[]): Rgb | null {
  const hue = h ? hueOf(h) : null;
  const saturation = s ? hslPercent(s) : null;
  const lightness = l ? hslPercent(l) : null;
  if (hue === null || saturation === null || lightness === null) return null;
  return hslToRgb(hue, saturation, lightness);
}

function parseOklch([l, c, h]: Token[], alpha: number): Oklch | null {
  const lightness = l ? scaled(l, 1) : null;
  const chroma = c ? scaled(c, 0.4) : null;
  const hue = h ? hueOf(h) : null;
  if (lightness === null || chroma === null || hue === null) return null;
  if (!inRange(lightness, 0, 1) || !inRange(chroma, 0, 0.5)) return null;
  return { l: lightness, c: chroma, h: hue, alpha };
}

function parseFunction(name: string, inside: string): Oklch | null {
  const args = splitArgs(inside);
  if (!args) return null;
  const alpha = alphaOf(args.alpha);
  if (alpha === null) return null;
  if (name === "oklch") return parseOklch(args.channels, alpha);
  const rgb = name.startsWith("rgb") ? parseRgb(args.channels) : parseHsl(args.channels);
  return rgb ? { ...rgbToOklch(rgb), alpha } : null;
}

/**
 * Parses a CSS color in hex, rgb()/rgba(), hsl()/hsla(), or oklch() syntax.
 * Returns null for anything else, including named colors, `var()`, `url()`,
 * comments, and out-of-range channels.
 */
export function parseColor(input: string): Oklch | null {
  const value = input.trim().toLowerCase();
  if (value.length === 0 || value.length > 64) return null;
  const hex = hexPattern.exec(value);
  if (hex?.[1]) {
    const { rgb, alpha } = parseHex(hex[1]);
    return { ...rgbToOklch(rgb), alpha };
  }
  const fn = functionPattern.exec(value);
  if (!fn?.[1] || fn[2] === undefined) return null;
  return parseFunction(fn[1], fn[2]);
}

/** The canonical string for a color: `oklch(L C H)`, with ` / A` only when it is not opaque. */
export function formatOklch(color: Oklch): string {
  const l = round(clamp(color.l, 0, 1), 4);
  const c = round(clamp(color.c, 0, 0.5), 4);
  const h = c === 0 ? 0 : round(color.h, 2);
  const alpha = round(clamp(color.alpha, 0, 1), 3);
  return alpha === 1 ? `oklch(${String(l)} ${String(c)} ${String(h)})` : `oklch(${String(l)} ${String(c)} ${String(h)} / ${String(alpha)})`;
}

/** Parses then formats; null when the input is not an accepted color. */
export function normalizeColor(input: string): string | null {
  const color = parseColor(input);
  return color ? formatOklch(color) : null;
}

const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

function rgbToOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  const h = c < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c: c < 1e-6 ? 0 : c, h, alpha: 1 };
}

/** Linear sRGB channels for an OKLCH color, clamped to the sRGB gamut. */
function oklchToLinearRgb({ l: L, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180;
  const A = c * Math.cos(radians);
  const B = c * Math.sin(radians);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, 0, 1),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, 0, 1),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s, 0, 1),
  ];
}

/** WCAG relative luminance (0 for black, 1 for white). Alpha is ignored. */
export function relativeLuminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearRgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque colors, from 1 to 21. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Mixes `a` toward `b` by `amount` (0 keeps `a`, 1 gives `b`) in OKLCH, taking the shorter way round the hue circle. */
export function mixOklch(a: Oklch, b: Oklch, amount: number): Oklch {
  const t = clamp(amount, 0, 1);
  const hueA = a.c < 1e-4 ? b.h : a.h;
  const hueB = b.c < 1e-4 ? hueA : b.h;
  const delta = ((hueB - hueA + 540) % 360) - 180;
  return {
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: (hueA + delta * t + 360) % 360,
    alpha: a.alpha + (b.alpha - a.alpha) * t,
  };
}

/**
 * Mixes `a` toward `b` by `amount` in OKLab, as CSS `color-mix(in oklab, …)`
 * does. Unlike OKLCH it never sweeps through unrelated hues when one side is
 * nearly grey, so a soft tint of a color into a paper background stays that color.
 */
export function mixOklab(a: Oklch, b: Oklch, amount: number): Oklch {
  const t = clamp(amount, 0, 1);
  const lab = (color: Oklch) => [color.c * Math.cos((color.h * Math.PI) / 180), color.c * Math.sin((color.h * Math.PI) / 180)] as const;
  const [aA, aB] = lab(a);
  const [bA, bB] = lab(b);
  const A = aA + (bA - aA) * t;
  const B = aB + (bB - aB) * t;
  const c = Math.hypot(A, B);
  return {
    l: a.l + (b.l - a.l) * t,
    c: c < 1e-6 ? 0 : c,
    h: c < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
    alpha: a.alpha + (b.alpha - a.alpha) * t,
  };
}

/**
 * Moves `color`'s lightness away from `background` in small steps until the
 * pair reaches `minimum` contrast, keeping hue and chroma. Returns the first
 * passing color, or the extreme (black or white side) when none passes.
 */
export function ensureContrast(color: Oklch, background: Oklch, minimum: number): Oklch {
  if (contrastRatio(color, background) >= minimum) return color;
  const direction = relativeLuminance(background) > 0.18 ? -1 : 1;
  let candidate = color;
  for (let step = 0; step < 200; step += 1) {
    candidate = { ...candidate, l: clamp(candidate.l + direction * 0.005, 0, 1) };
    if (contrastRatio(candidate, background) >= minimum) return candidate;
    if (candidate.l === 0 || candidate.l === 1) break;
  }
  return candidate;
}

const toGamma = (channel: number) => (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055);

/** The color as `#rrggbb` (alpha dropped), clamped to sRGB, for renderers that cannot read oklch() such as social preview images. */
export function formatHex(color: Oklch): string {
  return `#${oklchToLinearRgb(color).map((channel) => Math.round(clamp(toGamma(channel), 0, 1) * 255).toString(16).padStart(2, "0")).join("")}`;
}
