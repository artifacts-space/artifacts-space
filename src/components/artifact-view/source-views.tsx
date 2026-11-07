import { checkSvg, svgDataUri } from "@/lib/svg";
import { cn } from "@/lib/utils";

import { ViewNotice } from "./view-notice";

const sourceClass = "overflow-x-auto font-mono text-sm leading-7 whitespace-pre-wrap break-words";

/** Plain text, shown as written. */
export function TextView({ content }: { content: string }) {
  return <p className="max-w-[72ch] text-md leading-7 whitespace-pre-wrap break-words">{content}</p>;
}

/** Source code in monospace, with its language label. */
export function CodeView({ content, language }: { content: string; language?: string | undefined }) {
  return (
    <figure className="min-w-0">
      {language ? <figcaption className="mb-2 font-mono text-xs text-muted-foreground">{language}</figcaption> : null}
      <pre tabIndex={0} className={cn(sourceClass, "focus-visible:outline-2 focus-visible:outline-ring")}><code>{content}</code></pre>
    </figure>
  );
}

function prettyJson(content: string): string | null {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return null;
  }
}

/** JSON, pretty-printed. Invalid JSON shows as written, with a notice. */
export function JsonView({ content }: { content: string }) {
  const pretty = prettyJson(content);
  return (
    <div className="min-w-0 space-y-3">
      {pretty === null ? <ViewNotice tone="warning" title="This JSON does not parse, so it is shown as written." /> : null}
      <pre tabIndex={0} className={cn(sourceClass, "focus-visible:outline-2 focus-visible:outline-ring")}><code>{pretty ?? content}</code></pre>
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
