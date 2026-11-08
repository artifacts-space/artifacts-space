import type { MetadataRoute } from "next";

import { crawlOrigin, robotsFor } from "@/lib/crawl-rules";

/** robots.txt: crawl the marketing pages and docs, never the app, API, or OAuth routes. */
export default function robots(): MetadataRoute.Robots {
  return robotsFor(crawlOrigin());
}
