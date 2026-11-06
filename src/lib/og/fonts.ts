/*
 * Satoshi for social preview images.
 *
 * The ITF Free Font License lets us use Satoshi to make images, but not
 * redistribute the font files, and this repository will be public. So the
 * files are never committed: the image routes fetch the TTFs from Fontshare's
 * CDN when they render (at build time for static images). If Fontshare is
 * down, the images fall back to next/og's built-in Geist.
 */
import { cacheLife } from "next/cache";

const FONTSHARE_CSS = "https://api.fontshare.com/v2/css";
const FONT_HOST = "cdn.fontshare.com";
const TTF_URL = /url\(['"]?((?:https?:)?\/\/[^'")\s]+\.ttf)['"]?\)/;

export type SatoshiWeight = 500 | 700;

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: SatoshiWeight;
  style: "normal";
}

/**
 * The TTF URL in a Fontshare stylesheet, or null when there is none or it
 * points anywhere other than Fontshare's CDN.
 */
export function ttfUrlFromCss(css: string): string | null {
  const match = TTF_URL.exec(css);
  if (!match?.[1]) return null;
  const url = new URL(match[1], "https://api.fontshare.com");
  if (url.protocol !== "https:" || url.hostname !== FONT_HOST) return null;
  return url.href;
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Fontshare answered ${String(response.status)} for ${url}`);
  return response;
}

/** One Satoshi weight as TTF bytes. Throws on any failure so a miss is never cached. */
async function fetchSatoshi(weight: SatoshiWeight): Promise<ArrayBuffer> {
  "use cache";
  cacheLife("max");
  const css = await (await fetchOk(`${FONTSHARE_CSS}?f[]=satoshi@${String(weight)}`)).text();
  const url = ttfUrlFromCss(css);
  if (!url) throw new Error(`No Satoshi ${String(weight)} TTF in the Fontshare stylesheet`);
  return (await fetchOk(url)).arrayBuffer();
}

/**
 * Satoshi Medium and Bold for `ImageResponse`, or an empty list when Fontshare
 * cannot be reached, so the image still renders in next/og's default font.
 */
export async function loadSatoshi(): Promise<OgFont[]> {
  try {
    const [medium, bold] = await Promise.all([fetchSatoshi(500), fetchSatoshi(700)]);
    return [
      { name: "Satoshi", data: medium, weight: 500, style: "normal" },
      { name: "Satoshi", data: bold, weight: 700, style: "normal" },
    ];
  } catch (error) {
    console.error("[og] Satoshi did not load; using the default font", error);
    return [];
  }
}
