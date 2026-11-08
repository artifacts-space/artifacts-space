import { ImageResponse } from "next/og";

import { OG_HEADLINE, OG_WORDMARK } from "@/lib/site-copy";

import type { ArtifactOg } from "./artifact-og";
import { planetIcon40, strataInkBackground, strataInkPlainBackground } from "./assets";
import { fitText } from "./fit-text";
import { ogMonoFont, ogSansFonts } from "./fonts";
import { OgFrame } from "./frame";
import { OgHeadline } from "./headline";
import type { OgCover } from "./cover";
import { OgIconMark } from "./icon";
import { SynopsisCard } from "./synopsis-card";
import { OG_ARTIFACT_TEXT_WIDTH, OG_COVER_SCRIM, OG_SIZE, OG_TEXT, OG_TEXT_MUTED, OG_TITLE_TYPE } from "./theme";

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

const fill = { position: "absolute", left: 0, top: 0, width: OG_SIZE.width, height: OG_SIZE.height } as const;

/** The cover as the full-bleed backdrop: a gradient, or an image under a scrim. */
function CoverBackdrop({ cover }: { cover: OgCover }) {
  if (cover.type === "gradient") return <div style={{ ...fill, display: "flex", backgroundImage: `linear-gradient(${String(cover.angle)}deg, ${cover.from}, ${cover.to})` }} />;
  return (
    <div style={{ ...fill, display: "flex" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img> only */}
      <img src={cover.src} alt="" width={OG_SIZE.width} height={OG_SIZE.height} style={{ ...fill, objectFit: "cover", objectPosition: `50% ${String(cover.position)}%` }} />
      <div style={{ ...fill, display: "flex", backgroundImage: OG_COVER_SCRIM }} />
    </div>
  );
}

/** Text colors on the backdrop: the theme's ink on a light gradient, the standard light text on ink or an image. */
function textColors(cover: OgCover | null): { text: string; muted: string } {
  if (cover?.type === "gradient") return { text: cover.ink, muted: cover.muted };
  return { text: OG_TEXT, muted: OG_TEXT_MUTED };
}

/** One artifact's social preview: the planet and wordmark, its kind and title, and a synopsis card on the right, over its cover when it has one. */
export function artifactImageResponse(og: ArtifactOg, headers: Record<string, string> = {}): ImageResponse {
  const colors = textColors(og.cover);
  return new ImageResponse(
    (
      <OgFrame
        background={strataInkPlainBackground}
        backdrop={og.cover ? <CoverBackdrop cover={og.cover} /> : undefined}
        color={colors.text}
        icon={planetIcon40}
        wordmark={OG_WORDMARK}
        textWidth={OG_ARTIFACT_TEXT_WIDTH}
        aside={<SynopsisCard synopsis={og.synopsis} palette={og.palette} />}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {og.icon ? <OgIconMark icon={og.icon} /> : null}
          <div style={{ display: "flex", fontSize: 20, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: colors.muted }}>{og.kindLabel}</div>
          <ArtifactTitle title={og.title} />
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: [...ogSansFonts, ogMonoFont], headers },
  );
}
