import { ImageResponse } from "next/og";

import { OG_HEADLINE, OG_WORDMARK } from "@/lib/site-copy";

import type { ArtifactOg } from "./artifact-og";
import { planetIcon40, strataInkBackground, strataInkPlainBackground } from "./assets";
import { fitText } from "./fit-text";
import { ogMonoFont, ogSansFonts } from "./fonts";
import { OgFrame } from "./frame";
import { OgHeadline } from "./headline";
import { SynopsisCard } from "./synopsis-card";
import { OG_ARTIFACT_TEXT_WIDTH, OG_SIZE, OG_TEXT_MUTED, OG_TITLE_TYPE } from "./theme";

/** The site's social preview: Strata Ink, the planet and wordmark, and the headline from src/lib/site-copy.ts. */
export function siteImageResponse(headers: Record<string, string> = {}): ImageResponse {
  return new ImageResponse(
    (
      <OgFrame background={strataInkBackground} icon={planetIcon40} wordmark={OG_WORDMARK}>
        <OgHeadline text={OG_HEADLINE} />
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: [...ogSansFonts], headers },
  );
}

function ArtifactTitle({ title }: { title: string }) {
  const { fontSize, maxLines } = fitText(title, {
    maxWidth: OG_ARTIFACT_TEXT_WIDTH,
    maxHeight: OG_TITLE_TYPE.maxHeight,
    lineHeight: OG_TITLE_TYPE.lineHeight,
    sizes: OG_TITLE_TYPE.sizes,
    letterSpacingEm: OG_TITLE_TYPE.letterSpacingEm,
  });
  return (
    <div
      style={{
        display: "block",
        width: OG_ARTIFACT_TEXT_WIDTH,
        fontSize,
        fontWeight: 600,
        lineHeight: OG_TITLE_TYPE.lineHeight,
        letterSpacing: OG_TITLE_TYPE.letterSpacingEm * fontSize,
        lineClamp: maxLines,
      }}
    >
      {title}
    </div>
  );
}

/** One artifact's social preview: the planet and wordmark, its kind and title, and a synopsis card on the right. */
export function artifactImageResponse(og: ArtifactOg, headers: Record<string, string> = {}): ImageResponse {
  return new ImageResponse(
    (
      <OgFrame background={strataInkPlainBackground} icon={planetIcon40} wordmark={OG_WORDMARK} textWidth={OG_ARTIFACT_TEXT_WIDTH} aside={<SynopsisCard synopsis={og.synopsis} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", fontSize: 20, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: OG_TEXT_MUTED }}>{og.kindLabel}</div>
          <ArtifactTitle title={og.title} />
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: [...ogSansFonts, ogMonoFont], headers },
  );
}
