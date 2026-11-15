import { frameSpecText, readCanvas } from "@/lib/canvas/read";

import { fenced } from "./text";
import { uiSpecToMarkdown, type UiMarkdownOptions } from "./ui-spec";

/**
 * Renders a canvas artifact's JSON as Markdown: one section per frame, headed
 * by the frame's name and width, with the frame's interface as Markdown
 * (uiSpecToMarkdown). A frame without a usable spec gets a short note. A
 * canvas that cannot be read comes back as its JSON in a fenced block.
 */
export function canvasToMarkdown(content: string, options: UiMarkdownOptions = {}): string {
  const read = readCanvas(content);
  if (!read.renderable) return `_This canvas could not be read, so here is its source._\n\n${fenced(content, "json")}`;
  if (read.frames.length === 0) return "_This canvas has no frames yet._";
  return read.frames
    .map((frame) => {
      const spec = frameSpecText(frame);
      const body = spec === null ? "_This frame has no interface._" : uiSpecToMarkdown(spec, options);
      return `## ${frame.name} (${String(frame.width)} wide)\n\n${body}`;
    })
    .join("\n\n");
}
