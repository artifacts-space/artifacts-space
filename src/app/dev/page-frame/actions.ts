"use server";

import type { PageAddress, PageAddressRequest } from "@/lib/page-files/address";
import { fixturePageArtifactId } from "@/lib/page-files/serve-rules";
import { answerFor, mintPageToken, mintShorterPageToken, type PageToken } from "@/lib/page-files/token";
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
    return answerFor(mintPageToken({ artifactId: fixturePageArtifactId, label: await pageLabelFor(request.pageKey), asOf: null, stamp: 0 }));
  } catch {
    return null;
  }
}

/** How long the first address of a short-pass fixture page works, in milliseconds. */
const SHORT_PASS_MS = 8_000;

/** How long after a fixture page's first ask every ask still gets that first address: the page's load, where development mode runs each effect twice. */
const FIRST_ASKS_MS = 3_000;

/** The first, short address each fixture page got, by the `run` in the page's address. Development only, in memory. */
const firstPasses = new Map<string, { askedAt: number; made: PageToken }>();

/** The modes of the fixture's short-pass address (`?pass=`): the next address is a usual one, or none. */
export type FixturePassMode = "short" | "refused";

/**
 * Development only: the address of a fixture page that stays open past its
 * first address, for the renewal tests in e2e/page-files.spec.ts. The
 * address a page (one `run`) gets while it loads ends within seconds. A
 * later ask, the renewal, gets a usual address ("short"), or none, as for
 * a reader who lost access ("refused"). The page binds `mode` and `run`;
 * the frame calls it like any address action. Null in every other
 * environment.
 */
export async function fixtureShortPassAction(mode: FixturePassMode, run: string, request: PageAddressRequest): Promise<PageAddress | null> {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    const grant = { artifactId: fixturePageArtifactId, label: await pageLabelFor(request.pageKey), asOf: null, stamp: 0 };
    const now = Date.now();
    const first = firstPasses.get(run);
    if (first && now - first.askedAt < FIRST_ASKS_MS) return answerFor(first.made);
    if (first) {
      if (mode === "refused") return null;
      return answerFor(mintPageToken(grant));
    }
    if (firstPasses.size > 200) firstPasses.clear();
    const made = mintShorterPageToken(grant, new Date(now + SHORT_PASS_MS));
    firstPasses.set(run, { askedAt: now, made });
    return answerFor(made);
  } catch {
    return null;
  }
}
