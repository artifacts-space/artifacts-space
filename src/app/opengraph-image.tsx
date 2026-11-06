import { ImageResponse } from "next/og";

import { planetIcon40, strataInkBackground } from "@/lib/og/assets";
import { loadSatoshi } from "@/lib/og/fonts";
import { OgFrame } from "@/lib/og/frame";
import { OgHeadline } from "@/lib/og/headline";
import { OG_SIZE } from "@/lib/og/theme";
import { OG_HEADLINE, OG_WORDMARK } from "@/lib/site-copy";

export const alt = `${OG_WORDMARK}: ${OG_HEADLINE}`;
export const size = { width: OG_SIZE.width, height: OG_SIZE.height };
export const contentType = "image/png";

/** The site's social preview image. Static: rendered once at build time. Edit the words in src/lib/site-copy.ts. */
export default async function OpengraphImage() {
  const fonts = await loadSatoshi();
  return new ImageResponse(
    (
      <OgFrame background={strataInkBackground} icon={planetIcon40} wordmark={OG_WORDMARK}>
        <OgHeadline text={OG_HEADLINE} />
      </OgFrame>
    ),
    { ...size, fonts },
  );
}
