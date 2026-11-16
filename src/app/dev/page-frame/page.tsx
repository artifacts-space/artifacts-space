import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHostProvider } from "@/components/artifact-view/page-frame";
import { PageFrameFixture } from "@/components/dev/page-frame-fixture";
import { pageHostBase } from "@/lib/page-host/rules";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Page frame fixture",
  robots: { index: false, follow: false },
};

async function Fixture({ searchParams }: { searchParams: PageProps<"/dev/page-frame">["searchParams"] }) {
  const { page, host } = await searchParams;
  return (
    <PageHostProvider base={host === "none" ? null : pageHostBase()}>
      <PageFrameFixture page={typeof page === "string" ? page : "probe"} />
    </PageHostProvider>
  );
}

/**
 * Development-only page for e2e/page-frame.spec.ts: one HTML page running
 * in a page frame, without a database (page-frame-fixture.tsx). `?page=`
 * picks probe (a page that tries each way out of the sandbox and reports
 * what happened), leave (a page that sends its frame to another address),
 * reload (a page that reloads itself once), or plain. `?host=none` leaves the page host out, as on a
 * deployment that has none. Returns 404 in every other environment.
 */
export default function PageFrameFixturePage({ searchParams }: PageProps<"/dev/page-frame">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense>
      <Fixture searchParams={searchParams} />
    </Suspense>
  );
}
