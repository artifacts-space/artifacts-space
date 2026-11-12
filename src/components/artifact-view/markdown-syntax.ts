import type { Options } from "react-markdown";
import remarkGfm from "remark-gfm";

import { remarkBlockColors } from "@/lib/block-colors/remark-block-colors";
import { remarkFenceInfo } from "@/lib/markdown/remark-fence-info";

/**
 * The Markdown syntax every rendered artifact and comment is read with
 * (MarkdownView): GitHub-flavored Markdown, code fence attributes, and block
 * colors. The comment box judges what it writes by the same reading
 * (src/components/comments/thread-reading.ts), so keep the two on this list.
 */
export const markdownSyntaxPlugins: NonNullable<Options["remarkPlugins"]> = [remarkGfm, remarkFenceInfo, remarkBlockColors];
