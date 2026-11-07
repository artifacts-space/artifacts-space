import type { Metadata } from "next";

import { PreviewPage } from "@/components/preview/preview-page";
import { previewGroups } from "@/lib/preview/catalog";

export const metadata: Metadata = {
  title: "Artifact preview",
  description: "Every artifact component and format in light and dark mode.",
  robots: { index: false, follow: false },
};

/**
 * A review page for the owner: every ui component and format viewer in both
 * themes, with static sample data only. Linked from nowhere and not indexed.
 * It reads nothing from the request, so it prerenders at build time.
 */
export default function ArtifactPreviewPage() {
  return <PreviewPage groups={previewGroups()} />;
}
