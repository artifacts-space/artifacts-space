"use server";

import { z } from "zod";

import { hitRateLimit } from "@/lib/abuse/rate-limit";
import type { PageAddress, PageAddressRequest } from "@/lib/page-files/address";
import { isPublicId } from "@/lib/public-id";

import { renderPageAddress } from "./load";
import { openRenderToken, renderTokenPattern } from "./token";

const requestSchema = z.object({ pageKey: z.string().refine(isPublicId) });

/**
 * The page files address for the render page's frame: bound to the render
 * token on the server page (src/app/render/page/[token]/page.tsx), since the
 * hosted browser that draws the page has no session. Null for every refusal
 * and failure; the page then runs without its files. Counted against the
 * person who asked, like their own page views (`pageAddress`).
 */
export async function renderPageAddressAction(token: string, request: PageAddressRequest): Promise<PageAddress | null> {
  try {
    if (!renderTokenPattern.test(token)) return null;
    const { pageKey } = requestSchema.parse(request);
    const grant = openRenderToken(token);
    if (!grant) return null;
    const limit = await hitRateLimit("pageAddress", grant.userId);
    if (!limit.allowed) return null;
    return await renderPageAddress(token, pageKey);
  } catch (error) {
    if (!(error instanceof z.ZodError)) console.error("[page-render] An address could not be made", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}
