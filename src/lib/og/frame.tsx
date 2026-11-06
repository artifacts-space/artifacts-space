import type { ReactNode } from "react";

import { OG_SIZE, OG_TEXT, OG_TEXT_BOX, OG_WORDMARK_TYPE } from "@/lib/og/theme";

interface OgFrameProps {
  /** Full-bleed 1200×630 backdrop as a data URL. */
  background: string;
  /** 40×40 logo as a data URL. */
  icon: string;
  wordmark: string;
  /** Text under the wordmark, inside the left column. */
  children: ReactNode;
  /** Anything drawn over the backdrop outside the text column. */
  aside?: ReactNode;
  /** Width of the text column in px. */
  textWidth?: number;
}

/**
 * The shared social preview layout: backdrop, then a left text column with the
 * planet logo and wordmark above `children`. Satori only lays out flexbox, so
 * every element with more than one child sets `display: flex`.
 */
export function OgFrame({ background, icon, wordmark, children, aside, textWidth = OG_TEXT_BOX.width }: OgFrameProps) {
  return (
    <div style={{ position: "relative", display: "flex", width: OG_SIZE.width, height: OG_SIZE.height }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img> only */}
      <img src={background} alt="" width={OG_SIZE.width} height={OG_SIZE.height} style={{ position: "absolute", left: 0, top: 0 }} />
      {aside}
      <div
        style={{
          position: "absolute",
          left: OG_TEXT_BOX.left,
          top: 0,
          bottom: 0,
          width: textWidth,
          paddingBottom: OG_TEXT_BOX.paddingBottom,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: OG_TEXT_BOX.gap,
          color: OG_TEXT,
          fontFamily: "Satoshi",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: OG_WORDMARK_TYPE.gap,
            fontSize: OG_WORDMARK_TYPE.fontSize,
            fontWeight: 500,
            letterSpacing: OG_WORDMARK_TYPE.letterSpacingEm * OG_WORDMARK_TYPE.fontSize,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img> only */}
          <img src={icon} alt="" width={OG_WORDMARK_TYPE.iconSize} height={OG_WORDMARK_TYPE.iconSize} style={{ imageRendering: "pixelated" }} />
          {wordmark}
        </div>
        {children}
      </div>
    </div>
  );
}
