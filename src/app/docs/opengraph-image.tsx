import { ImageResponse } from "next/og";

import { planetIcon40, strataInkBackground } from "@/lib/og/assets";
import { loadSatoshi } from "@/lib/og/fonts";
import { OgFrame } from "@/lib/og/frame";
import { OgHeadline } from "@/lib/og/headline";
import { OG_SIZE, OG_TEXT_MUTED } from "@/lib/og/theme";
import { OG_WORDMARK } from "@/lib/site-copy";

const headline = "Connect your agents, build rich artifacts, and share the work.";

export const alt = `artifacts.space docs: ${headline}`;
export const size = { width: OG_SIZE.width, height: OG_SIZE.height };
export const contentType = "image/png";

/** The docs' social preview: the site frame with a "Docs" kicker. Static: rendered once at build time. */
export default async function DocsOpengraphImage() {
  const fonts = await loadSatoshi();
  return new ImageResponse(
    (
      <OgFrame background={strataInkBackground} icon={planetIcon40} wordmark={OG_WORDMARK}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", fontSize: 20, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: OG_TEXT_MUTED }}>Docs</div>
          <OgHeadline text={headline} />
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts },
  );
}
