import { highlightCode } from "#syntax-highlight";

import { CodeBlock } from "@/components/code/code-block";
import { prettyJson } from "@/lib/pretty-json";
import { checkSvg, svgDataUri } from "@/lib/svg";
import { cn } from "@/lib/utils";

import { ViewNotice } from "./view-notice";

const sourceClass = "overflow-x-auto font-mono text-sm leading-7 whitespace-pre-wrap break-words";

/** Plain text, shown as written on a quiet sheet, so it reads as a document. */
export function TextView({ content }: { content: string }) {
  return (
    <article className="min-w-0 rounded-lg border bg-card px-5 py-5 text-card-foreground sm:px-8 sm:py-7">
      <div className="max-w-[72ch] text-base leading-7 whitespace-pre-wrap break-words">{content}</div>
    </article>
  );
}

/**
 * Source code in the shared code block. In a server component it arrives
 * highlighted, with no highlighter in the page; elsewhere the block
 * highlights itself.
 */
export function CodeView({ content, language }: { content: string; language?: string | undefined }) {
  return <CodeBlock code={content} language={language} lines={highlightCode(content, language)} />;
}

/** JSON, pretty-printed and highlighted. Invalid JSON shows as written, with a notice. */
export function JsonView({ content }: { content: string }) {
  const pretty = prettyJson(content);
  const code = pretty ?? content;
  return (
    <div className="min-w-0 space-y-3">
      {pretty === null ? <ViewNotice tone="warning" title="This JSON does not parse, so it is shown as written." /> : null}
      <CodeBlock code={code} language="json" lines={pretty === null ? null : highlightCode(code, "json")} />
    </div>
  );
}

/** SVG shown only through an <img> data URI, so scripts in it never run. */
export function SvgView({ content, title }: { content: string; title: string }) {
  const check = checkSvg(content);
  if (!check.ok) {
    return (
      <div className="space-y-3">
        <ViewNotice tone="warning" title="This SVG could not be shown.">{check.error}</ViewNotice>
        <pre className={cn(sourceClass, "max-h-80 overflow-auto")}>{content}</pre>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 justify-center rounded-md border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-size-[16px_16px] p-4 shadow-xs">
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URI image, which next/image cannot optimize */}
      <img src={svgDataUri(content)} alt={title} className="h-auto max-h-[70vh] max-w-full" />
    </div>
  );
}
