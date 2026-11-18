import type { Options } from "react-markdown";
import remarkGfm from "remark-gfm";

import { remarkBlockColors } from "@/lib/block-colors/remark-block-colors";
import { remarkCellBreaks } from "@/lib/markdown/remark-cell-breaks";
import { remarkFenceInfo } from "@/lib/markdown/remark-fence-info";

/**
 * The Markdown syntax every rendered artifact and comment is read with
 * (MarkdownView): GitHub-flavored Markdown, code fence attributes, block
 * colors, and `<br>` in a table cell as a line break. The comment box judges what it writes by the same reading
 * (src/components/comments/thread-reading.ts), so keep the two on this list.
 */
export const markdownSyntaxPlugins: NonNullable<Options["remarkPlugins"]> = [remarkGfm, remarkFenceInfo, remarkBlockColors, remarkCellBreaks];
