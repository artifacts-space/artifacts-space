import type { NextRequest } from "next/server";

import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { loadArtifactOg } from "@/lib/og/artifact-og";
import { artifactImageResponse, siteImageResponse } from "@/lib/og/render";

/*
 * An artifact's social preview image, at /artifact/<publicId>/og/<versionId>.
 * The share page links it from og:image and twitter:image with the approved
 * version id (src/lib/og/artifact-og.ts), so one URL always shows the same
 * picture: it is cached for a year, and a new approval changes the URL.
 * Anything that may not be previewed (private, team, deleted, unknown, or a
 * version that is not the approved one) gets the generic site image with the
 * same short cache, so the response never tells whether an artifact exists.
 */

const versionCache = "public, max-age=31536000, immutable";
const genericCache = "public, max-age=300";

async function rateLimited(request: NextRequest) {
  try {
    return await hitRateLimits([{ name: "ogImageByNetwork", subject: networkKey(request.headers) }]);
  } catch (error) {
    console.error("[og] Rate limit check failed; rendering anyway", error);
    return null;
  }
}

async function preview(publicId: string, version: string) {
  try {
    return await loadArtifactOg(publicId, version);
  } catch (error) {
    console.error("[og] Artifact preview failed; using the site image", error);
    return null;
  }
}

/** Draws the preview, or the generic site image whenever the artifact may not be previewed. */
export async function GET(request: NextRequest, context: RouteContext<"/artifact/[publicId]/og/[version]">) {
  const refusal = await rateLimited(request);
  if (refusal) return tooManyRequests(refusal);
  const { publicId, version } = await context.params;
  const og = await preview(publicId, version);
  if (og) return artifactImageResponse(og, { "Cache-Control": versionCache });
  return siteImageResponse({ "Cache-Control": genericCache });
}
