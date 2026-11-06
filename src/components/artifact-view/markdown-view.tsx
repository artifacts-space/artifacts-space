import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { safeHref } from "@/lib/link-policy";
import { cn } from "@/lib/utils";

import { ExternalLink } from "./external-link";

/**
 * Element overrides. Links follow the link policy. Images never load: they
 * could track readers, and artifact images will come only from our own file
 * storage, so an image shows as its alt text instead.
 */
const components: Components = {
  a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
  img: ({ alt }) => <span className="text-muted-foreground">[Image{alt ? `: ${alt}` : ""}]</span>,
};

/** Keeps only URLs the link policy allows. Everything else becomes an empty href. */
function urlTransform(url: string): string {
  return safeHref(url) ?? "";
}

/**
 * GitHub-flavored Markdown rendered as prose. Raw HTML is never rendered
 * (skipHtml), and links pass through the same policy as every artifact link.
 * Works on the server and the client.
 */
export function MarkdownView({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("artifact-prose", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={urlTransform} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
