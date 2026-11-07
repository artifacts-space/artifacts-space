import { IconRobot } from "@tabler/icons-react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

import { highlightCode } from "#syntax-highlight";

import { CodeBlock } from "@/components/code/code-block";
import type { MentionKind } from "@/lib/comments/mentions";
import { remarkMentions } from "@/lib/comments/remark-mentions";
import { safeHref } from "@/lib/link-policy";
import { cn } from "@/lib/utils";

import { ExternalLink } from "./external-link";

/** A resolved @mention: a subtle chip. Agents get a robot icon and their own hue. */
function MentionChip({ kind, children }: { kind: MentionKind; children: React.ReactNode }) {
  const agent = kind === "agent";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm px-1 align-baseline font-medium",
        agent ? "bg-mention-agent text-mention-agent-foreground" : "bg-mention text-mention-foreground",
      )}
    >
      {agent ? <IconRobot className="size-3 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}

type HastNode = NonNullable<ExtraProps["node"]>["children"][number];

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return "";
  return node.children.map(textOf).join("");
}

/** The language from a fenced block's `language-*` class, if any. */
function fenceLanguage(className: unknown): string | undefined {
  const classes = Array.isArray(className) ? className : [];
  const match = classes.find((name): name is string => typeof name === "string" && name.startsWith("language-"));
  return match?.slice("language-".length);
}

/** A fenced code block, drawn by the shared CodeBlock and highlighted on the server when it can be. */
function FencedCode({ node }: ExtraProps) {
  const code = node?.children.find((child) => child.type === "element" && child.tagName === "code");
  if (code?.type !== "element") return null;
  const text = textOf(code);
  const language = fenceLanguage(code.properties.className);
  return <CodeBlock code={text} language={language} lines={highlightCode(text, language)} capHeight />;
}

/**
 * Element overrides. Links follow the link policy. Images never load: they
 * could track readers, and artifact images will come only from our own file
 * storage, so an image shows as its alt text instead. Spans exist only when
 * the mention plugin made them (raw HTML is skipped), and render as chips.
 * Fenced code renders as the shared code block.
 */
const components: Components = {
  pre: FencedCode,
  a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
  img: ({ alt }) => <span className="text-muted-foreground">[Image{alt ? `: ${alt}` : ""}]</span>,
  span: ({ node, children }) => {
    const kind = node?.properties.dataMention;
    if (kind !== "person" && kind !== "agent") return <span>{children}</span>;
    return <MentionChip kind={kind}>{children}</MentionChip>;
  },
};

/** Keeps only URLs the link policy allows. Everything else becomes an empty href. */
function urlTransform(url: string): string {
  return safeHref(url) ?? "";
}

const noMentions: ReadonlyMap<string, MentionKind> = new Map();

/**
 * GitHub-flavored Markdown rendered as prose. Raw HTML is never rendered
 * (skipHtml), and links pass through the same policy as every artifact link.
 * `mentions` lists the @handles that resolved, which show as chips.
 * Works on the server and the client.
 */
export function MarkdownView({ content, className, mentions = noMentions }: { content: string; className?: string; mentions?: ReadonlyMap<string, MentionKind> }) {
  return (
    <div className={cn("artifact-prose", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMentions(mentions)]} skipHtml urlTransform={urlTransform} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
