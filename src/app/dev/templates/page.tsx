import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { TemplatesFixture } from "@/components/dev/templates-fixture";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Section templates",
  robots: { index: false, follow: false },
};

async function Fixture({ searchParams }: { searchParams: PageProps<"/dev/templates">["searchParams"] }) {
  const { template } = await searchParams;
  return <TemplatesFixture only={typeof template === "string" ? template : null} />;
}

/**
 * Development-only page for the templates e2e tests: every section template
 * (src/lib/ui/templates) drawn by the real renderer at 1440 and at 390
 * pixels wide, without a database. `?template=<id>` shows one. Returns 404
 * in every other environment.
 */
export default function TemplatesFixturePage({ searchParams }: PageProps<"/dev/templates">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense>
      <Fixture searchParams={searchParams} />
    </Suspense>
  );
}
