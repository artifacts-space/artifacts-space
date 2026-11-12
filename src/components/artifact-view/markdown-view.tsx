import { IconRobot } from "@tabler/icons-react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";

import { highlightCode } from "#syntax-highlight";

import { CodeBlock } from "@/components/code/code-block";
import { blockColorAttributes, readBlockHue } from "@/lib/block-colors/block-color-rules";
import type { MentionKind } from "@/lib/comments/mentions";
import { remarkMentions } from "@/lib/comments/remark-mentions";
import { isFileLinkPath, isFileMediaUrl } from "@/lib/files/media-rules";
import { parseFenceInfo, type FenceInfo } from "@/lib/markdown/fence-info";
import { artifactLinkHref } from "@/lib/markdown/link-href";
import { isMermaidLanguage } from "@/lib/markdown/mermaid-fence";
import { cn } from "@/lib/utils";

import { ExternalLink } from "./external-link";
import { InlineFileImage, MarkdownMedia } from "./markdown-media";
import { markdownSyntaxPlugins } from "./markdown-syntax";
import { BlockCaption, MarkdownMermaid } from "./markdown-mermaid";

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
function classLanguage(className: unknown): string | undefined {
  const classes = Array.isArray(className) ? className : [];
  const match = classes.find((name): name is string => typeof name === "string" && name.startsWith("language-"));
  return match?.slice("language-".length);
}

/** A fenced block's code, language, and attributes (from the fence line as written), or null when the `pre` holds no code. */
function fencedCodeOf(node: ExtraProps["node"]): { text: string; language: string | undefined; info: FenceInfo } | null {
  const code = node?.children.find((child) => child.type === "element" && child.tagName === "code");
  if (code?.type !== "element") return null;
  const info = parseFenceInfo(code.properties.dataFenceInfo);
  return { text: textOf(code), language: classLanguage(code.properties.className), info };
}

/**
 * A fenced code block, drawn by the shared CodeBlock and highlighted on the
 * server when it can be. `wrap=true` wraps long lines, and a caption shows
 * below (markdown-dialect.md, "Code block attributes").
 */
function FencedCode({ node }: ExtraProps) {
  const fenced = fencedCodeOf(node);
  if (!fenced) return null;
  const block = <CodeBlock code={fenced.text} language={fenced.language} lines={highlightCode(fenced.text, fenced.language)} wrap={fenced.info.wrap} capHeight />;
  if (!fenced.info.caption) return block;
  return <figure data-code-figure="" className="min-w-0">{block}<BlockCaption caption={fenced.info.caption} /></figure>;
}

/** A fenced block in a document: a ```mermaid block draws in its view (markdown-dialect.md); any other is code. */
function FencedCodeOrDiagram({ node }: ExtraProps) {
  const fenced = fencedCodeOf(node);
  if (fenced && isMermaidLanguage(fenced.language)) return <MarkdownMermaid code={fenced.text.replace(/\n$/u, "")} view={fenced.info.view} caption={fenced.info.caption} />;
  return <FencedCode node={node} />;
}

/** An image as its alt text: what every image that is not an upload shows, so nothing can track readers. */
function ImageAltText({ alt }: { alt: string | undefined }) {
  return <span className="text-muted-foreground">[Image{alt ? `: ${alt}` : ""}]</span>;
}

function stringProperty(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** The uploaded file a paragraph holds when it is a media block: one image alone, pointing at /api/files. */
function mediaImageOf(node: ExtraProps["node"]): { src: string; alt: string; title: string | null } | null {
  const children = (node?.children ?? []).filter((child) => child.type !== "text" || child.value.trim() !== "");
  const [only] = children;
  if (children.length !== 1 || only?.type !== "element" || only.tagName !== "img") return null;
  const src = stringProperty(only.properties.src);
  if (!src || !isFileMediaUrl(src)) return null;
  return { src, alt: stringProperty(only.properties.alt) ?? "", title: stringProperty(only.properties.title) };
}

/** The block color attributes the color plugin put on an element (remark-block-colors.ts), checked again. */
function blockColorProps(node: ExtraProps["node"]): Record<string, string> {
  const properties = node?.properties;
  return blockColorAttributes({ color: readBlockHue(properties?.dataBlockColor), background: readBlockHue(properties?.dataBlockBackground) });
}

/**
 * Element overrides. Links follow the link policy. Images never load from
 * other sites: they could track readers, so an image shows as its alt text
 * instead. Spans exist only when the mention plugin made them (raw HTML is
 * skipped), and render as chips. Fenced code renders as the shared code block.
 */
const components: Components = {
  pre: FencedCode,
  a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
  img: ({ alt }) => <ImageAltText alt={alt} />,
  span: ({ node, children }) => {
    const kind = node?.properties.dataMention;
    if (kind !== "person" && kind !== "agent") return <span {...blockColorProps(node)}>{children}</span>;
    return <MentionChip kind={kind}>{children}</MentionChip>;
  },
};

/**
 * An artifact's own Markdown also shows its uploaded files (see
 * markdown-dialect.md): an image alone in its paragraph becomes a media
 * block (image, player, PDF, or download card), an upload inside text shows
 * inline, and links to uploads stay on this site. Every one loads through
 * the access-checked /api/files route.
 */
const mediaComponents: Components = {
  ...components,
  p: ({ node, children }) => {
    const media = mediaImageOf(node);
    return media ? <MarkdownMedia {...media} /> : <p {...blockColorProps(node)}>{children}</p>;
  },
  a: ({ href, children }) => (typeof href === "string" && isFileLinkPath(href) ? <a href={href} className="underline decoration-border underline-offset-[3px] hover:decoration-foreground">{children}</a> : <ExternalLink href={href}>{children}</ExternalLink>),
  img: ({ src, alt }) => (typeof src === "string" && isFileMediaUrl(src) ? <InlineFileImage src={src} alt={alt ?? ""} /> : <ImageAltText alt={alt} />),
};

/** Component sets by what the Markdown may show: media (uploads) and diagrams (```mermaid blocks). */
const componentSets = {
  plain: components,
  media: mediaComponents,
  diagrams: { ...components, pre: FencedCodeOrDiagram },
  mediaDiagrams: { ...mediaComponents, pre: FencedCodeOrDiagram },
} satisfies Record<string, Components>;

function componentsFor(media: boolean, diagrams: boolean): Components {
  if (diagrams) return media ? componentSets.mediaDiagrams : componentSets.diagrams;
  return media ? componentSets.media : componentSets.plain;
}

/** Keeps only URLs the link policy allows, and links to this site's uploads (artifactLinkHref). Everything else becomes an empty href. */
function urlTransform(url: string): string {
  return artifactLinkHref(url) ?? "";
}

const noMentions: ReadonlyMap<string, MentionKind> = new Map();

/**
 * GitHub-flavored Markdown rendered as prose. Raw HTML is never rendered
 * (skipHtml), and links pass through the same policy as every artifact link.
 * `mentions` lists the @handles that resolved, which show as chips. `media`
 * shows uploaded files, for an artifact's own content (not comments).
 * `diagrams` draws fenced ```mermaid blocks as diagrams, for an artifact's
 * own Markdown (not comments); Mermaid loads only when one is on the page.
 * Works on the server and the client.
 */
export function MarkdownView({ content, className, mentions = noMentions, media = false, diagrams = false }: { content: string; className?: string; mentions?: ReadonlyMap<string, MentionKind>; media?: boolean; diagrams?: boolean }) {
  return (
    <div className={cn("artifact-prose", className)}>
      <ReactMarkdown remarkPlugins={[...markdownSyntaxPlugins, remarkMentions(mentions)]} skipHtml urlTransform={urlTransform} components={componentsFor(media, diagrams)}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
