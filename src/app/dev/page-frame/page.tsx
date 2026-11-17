import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHostProvider } from "@/components/artifact-view/page-frame";
import { PageFrameFixture } from "@/components/dev/page-frame-fixture";
import { pageHostBase } from "@/lib/page-host/rules";

import { fixturePageAddressAction, fixtureShortPassAction } from "./actions";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Page frame fixture",
  robots: { index: false, follow: false },
};

async function Fixture({ searchParams }: { searchParams: PageProps<"/dev/page-frame">["searchParams"] }) {
  const { page, host, pass, run } = await searchParams;
  // `?pass=short|refused&run=<any text>`: the page's first files address ends within seconds (fixtureShortPassAction).
  const short = (pass === "short" || pass === "refused") && typeof run === "string" && run.length <= 64 ? fixtureShortPassAction.bind(null, pass, run) : null;
  return (
    <PageHostProvider base={host === "none" ? null : pageHostBase()} address={short ?? fixturePageAddressAction}>
      <PageFrameFixture page={typeof page === "string" ? page : "probe"} />
    </PageHostProvider>
  );
}

/**
 * Development-only page for e2e/page-frame.spec.ts: one HTML page running
 * in a page frame, without a database (page-frame-fixture.tsx). `?page=`
 * picks probe (a page that tries each way out of the sandbox and reports
 * what happened), leave (a page that sends its frame to another address),
 * reload (a page that reloads itself once), plain, or files (a page that loads
 * its own page files by relative path, for e2e/page-files.spec.ts). `?host=none` leaves the page host out, as on a
 * deployment that has none. `?pass=short&run=<text>` gives the files page a first address that ends within seconds and
 * a usual one after it; `?pass=refused` gives none after it. Returns 404 in every other environment.
 */
export default function PageFrameFixturePage({ searchParams }: PageProps<"/dev/page-frame">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense>
      <Fixture searchParams={searchParams} />
    </Suspense>
  );
}
