import { fitText } from "@/lib/og/fit-text";
import { OG_HEADLINE_TYPE, OG_TEXT_BOX } from "@/lib/og/theme";

/**
 * A display headline that fits the text column: the largest size whose lines
 * fit the height budget (three lines at 64px), with a hard line clamp and an
 * ellipsis when even the smallest size is not enough.
 */
export function OgHeadline({ text }: { text: string }) {
  const { fontSize, maxLines } = fitText(text, {
    maxWidth: OG_TEXT_BOX.width,
    maxHeight: OG_HEADLINE_TYPE.maxHeight,
    lineHeight: OG_HEADLINE_TYPE.lineHeight,
    sizes: OG_HEADLINE_TYPE.sizes,
    letterSpacingEm: OG_HEADLINE_TYPE.letterSpacingEm,
  });
  return (
    <div
      style={{
        display: "block",
        width: OG_TEXT_BOX.width,
        margin: 0,
        fontSize,
        fontWeight: 700,
        lineHeight: OG_HEADLINE_TYPE.lineHeight,
        letterSpacing: OG_HEADLINE_TYPE.letterSpacingEm * fontSize,
        lineClamp: maxLines,
      }}
    >
      {text}
    </div>
  );
}
