import { readImageHeader } from "@/lib/files/image-size-rules";

import { pageImageLimits, screenshotEndpoint, screenshotRequestBody, type PageViewport } from "./rules";

/*
 * The hosted browser that draws pages: Cloudflare Browser Run's screenshot
 * endpoint (REST). Its settings are read on each use, never at import time,
 * so the build needs no secrets. Nothing here logs the address it opens
 * (it holds a render token) or the API token.
 */

/** The account and API token for Browser Run, or null where pictures of pages are not set up. */
export interface BrowserRunConfig {
  accountId: string;
  apiToken: string;
}

/**
 * Browser Run's settings: `CLOUDFLARE_BROWSER_RUN_TOKEN` (an API token with
 * "Browser Rendering - Edit") and the account, `CLOUDFLARE_ACCOUNT_ID`, or
 * the R2 account where that is unset. Null when either is missing.
 */
export function browserRunConfigFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): BrowserRunConfig | null {
  const apiToken = env.CLOUDFLARE_BROWSER_RUN_TOKEN?.trim();
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID ?? env.R2_ACCOUNT_ID)?.trim();
  if (!apiToken || !accountId) return null;
  return { accountId, apiToken };
}

/** A picture the browser drew, checked: WebP, the window's exact size, and within the byte limit. */
export interface DrawnPage {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: "image/webp";
}

/**
 * Checks what came back: a WebP of the window's exact pixel size, no bigger
 * than pageImageLimits.maxBytes. The type comes from the bytes, never from
 * a header. Null for anything else, so a picture that is not what was
 * asked for never reaches a model.
 */
export function checkedPicture(bytes: Uint8Array<ArrayBuffer>, viewport: PageViewport): DrawnPage | null {
  if (bytes.byteLength === 0 || bytes.byteLength > pageImageLimits.maxBytes) return null;
  const header = readImageHeader(bytes);
  if (header?.type !== "image/webp") return null;
  if (header.width !== viewport.width || header.height !== viewport.height) return null;
  return { bytes, contentType: "image/webp" };
}

/**
 * Asks Browser Run to open `url` (the render page) at the viewport's size
 * and returns the checked picture, or null when it could not be drawn: a
 * refusal, a timeout, an error, or a picture that fails the check. The
 * reason is logged by status only.
 */
export async function drawPage(config: BrowserRunConfig, url: string, viewport: PageViewport, fetcher: typeof fetch = fetch): Promise<DrawnPage | null> {
  try {
    const response = await fetcher(screenshotEndpoint(config.accountId), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(screenshotRequestBody(url, viewport)),
      signal: AbortSignal.timeout(pageImageLimits.requestTimeoutMs),
    });
    if (!response.ok) {
      console.error("[page-render] The browser refused to draw a page", response.status);
      return null;
    }
    const picture = checkedPicture(new Uint8Array(await response.arrayBuffer()), viewport);
    if (!picture) console.error("[page-render] The browser returned a picture that failed the check");
    return picture;
  } catch (error) {
    console.error("[page-render] The browser could not be reached", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}
