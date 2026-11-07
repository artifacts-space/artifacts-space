import type { Metadata } from "next";

import { docsHref, docsPage, type DocsSlug } from "./pages";

/** The docs social image (src/app/docs/opengraph-image.tsx). A page's own openGraph replaces the inherited image, so each page names it. */
const docsImage = { url: "/docs/opengraph-image", width: 1200, height: 630, alt: "artifacts.space docs" };

/** Title, description, canonical URL, and social image for a registry page. The docs layout adds the title template. */
export function docsMetadata(slug: DocsSlug): Metadata {
  const page = docsPage(slug);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: docsHref(page.slug) },
    openGraph: { title: `${page.title} · artifacts.space docs`, description: page.description, type: "article", images: [docsImage] },
  };
}
