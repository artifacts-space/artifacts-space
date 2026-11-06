import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComponentGallery } from "@/components/dev/component-gallery";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Component gallery",
  robots: { index: false, follow: false },
};

/** Development-only gallery of every ui component and format viewer. Returns 404 in every other environment. */
export default function ComponentGalleryPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ComponentGallery />;
}
