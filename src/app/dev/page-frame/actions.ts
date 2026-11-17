"use server";

import type { PageAddress, PageAddressRequest } from "@/lib/page-files/address";
import { fixturePageArtifactId } from "@/lib/page-files/serve-rules";
import { mintPageToken } from "@/lib/page-files/token";
import { pageLabelFor } from "@/lib/page-host/rules";

/**
 * Development only: the page files address for the fixture page
 * (/dev/page-frame?page=files). It makes a real token, for the fixture's
 * stand-in artifact, which serve.ts answers from files held in memory under
 * `next dev` and nowhere else. Null in every other environment.
 */
export async function fixturePageAddressAction(request: PageAddressRequest): Promise<PageAddress | null> {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    const { token, expiresAt } = mintPageToken({ artifactId: fixturePageArtifactId, label: await pageLabelFor(request.pageKey), asOf: null, stamp: 0 });
    return { token, expiresAt: expiresAt.toISOString() };
  } catch {
    return null;
  }
}
