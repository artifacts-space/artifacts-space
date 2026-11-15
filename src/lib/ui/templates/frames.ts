import type { TemplateViewport } from "./types";

/*
 * The frames a template is drawn in. One record, read by the page that
 * draws the frames (/dev/templates) and by every spec that looks at them
 * (e2e/templates.spec.ts, e2e/templates-behavior.spec.ts), so a template
 * made for one end only is drawn and checked at the same widths.
 */

/** A frame width on the template page: a desktop, a tablet, and a phone. */
export type TemplateFrameWidth = 1440 | 768 | 390;

/**
 * The frame widths a template is drawn at, by the viewport it is made for,
 * from wide to narrow. The tablet frame sits between the width steps the
 * blocks change at (576, 672, and 896 pixels), where a layout made for the
 * two ends can show a part twice or not at all.
 */
export const templateFrameWidths: Record<TemplateViewport, readonly TemplateFrameWidth[]> = { fluid: [1440, 768, 390], wide: [1440, 768], phone: [390] };
