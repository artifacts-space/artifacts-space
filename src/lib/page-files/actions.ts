"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimit } from "@/lib/abuse/rate-limit";
import { isPublicId } from "@/lib/public-id";
import { getSession } from "@/lib/session";

import { pageAddressFor, type PageAddress, type PageAddressRequest } from "./address";

const requestSchema = z.object({
  pageKey: z.string().refine(isPublicId),
  versionId: z.string().min(1).max(100).optional(),
});

/**
 * The address an HTML artifact's page loads its files from, for the viewer
 * who asks: signed in or not, as the artifact's own access check decides
 * (pageAddressFor). Null for every refusal and failure, so an artifact the
 * viewer may not read answers as one that does not exist; the page then
 * runs without its files. Limited per person, or per network for a
 * signed-out reader, before the access check runs.
 */
export async function pageAddressAction(request: PageAddressRequest): Promise<PageAddress | null> {
  try {
    const input = requestSchema.parse(request);
    const [session, requestHeaders] = await Promise.all([getSession(), headers()]);
    const viewerId = session?.user.id ?? null;
    const limit = await hitRateLimit("pageAddress", viewerId ?? `network:${networkKey(requestHeaders)}`);
    if (!limit.allowed) return null;
    return await pageAddressFor(input, viewerId);
  } catch (error) {
    if (!(error instanceof z.ZodError)) console.error("[page-files] An address could not be made", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}
