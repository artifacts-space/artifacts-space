import { siteImageResponse } from "@/lib/og/render";
import { siteImageAlt } from "@/lib/og/site-meta";
import { OG_SIZE } from "@/lib/og/theme";

export const alt = siteImageAlt;
export const size = { width: OG_SIZE.width, height: OG_SIZE.height };
export const contentType = "image/png";

/** The site's social preview image. Static: rendered once at build time. Edit the words in src/lib/site-copy.ts. */
export default function OpengraphImage() {
  return siteImageResponse();
}
