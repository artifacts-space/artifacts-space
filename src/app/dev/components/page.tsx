import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ComponentGallery } from "@/components/dev/component-gallery";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Component gallery",
  robots: { index: false, follow: false },
};

async function Gallery({ searchParams }: { searchParams: PageProps<"/dev/components">["searchParams"] }) {
  const { show } = await searchParams;
  return <ComponentGallery show={show ?? []} />;
}

/**
 * Development-only gallery of every ui component and format viewer.
 * `?show=<group>` or `?show=<group>/<specimen>`, repeated, draws only those
 * groups and specimens, so an e2e test loads only what it checks
 * (src/components/dev/gallery-filter.ts). Returns 404 in every other environment.
 */
export default function ComponentGalleryPage({ searchParams }: PageProps<"/dev/components">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense>
      <Gallery searchParams={searchParams} />
    </Suspense>
  );
}
