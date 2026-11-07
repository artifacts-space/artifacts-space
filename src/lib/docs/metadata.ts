import type { Metadata } from "next";

import { docsHref, docsPage, type DocsSlug } from "./pages";

/** Title, description, and canonical URL for a registry page. The docs layout adds the title template. */
export function docsMetadata(slug: DocsSlug): Metadata {
  const page = docsPage(slug);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: docsHref(page.slug) },
    openGraph: { title: `${page.title} · artifacts.space docs`, description: page.description, type: "article" },
  };
}
