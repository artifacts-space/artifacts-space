import type { NextRequest } from "next/server";

import { networkKey } from "@/lib/abuse/network-key";
import { hitRateLimits } from "@/lib/abuse/rate-limit";
import { tooManyRequests } from "@/lib/abuse/responses";
import { loadArtifactOg } from "@/lib/og/artifact-og";
import { artifactImageResponse, siteImageResponse } from "@/lib/og/render";

/*
 * An artifact's social preview image, at
 * /artifact/<publicId>/og/<versionId>.<themeKey>. The share page links it
 * from og:image and twitter:image with the approved version id and the key
 * of the theme it resolves to (src/lib/og/artifact-og.ts), so one URL always
 * shows the same picture: it is cached for a year, and a new approval or a
 * theme change (such as a new team default) changes the URL. An old or
 * missing key still draws the current picture, cached briefly.
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
  // A cover image that could not be fetched this time falls back to the standard backdrop, and an old theme key draws today's theme; cache those briefly.
  if (og) return artifactImageResponse(og, { "Cache-Control": og.coverDegraded || !og.themeCurrent ? genericCache : versionCache });
  return siteImageResponse({ "Cache-Control": genericCache });
}
