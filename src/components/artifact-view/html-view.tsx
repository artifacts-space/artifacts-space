"use client";

import { CodeBlock } from "@/components/code/code-block";

import { PageFrame, usePagesCanRun } from "./page-frame";
import { ViewNotice } from "./view-notice";

/** The key every sample and preview shares when the caller names no artifact. */
const samplePage = "sample";

/**
 * An HTML artifact: the page, running in a sandbox on its own page host
 * (page-frame.tsx), in a window-like box that the page scrolls inside.
 * Where no page host is set up, the page cannot run, so its source shows
 * with a note. The page's scripts never run on this site's origin.
 */
export function HtmlView({ content, title, pageKey }: { content: string; title: string; pageKey?: string | undefined }) {
  const canRun = usePagesCanRun();
  if (!canRun) {
    return (
      <div className="min-w-0 space-y-3">
        <ViewNotice title="This page cannot run here, so its source is shown.">Pages with scripts run on a separate page host, and none is set up for this page.</ViewNotice>
        <CodeBlock code={content} language="html" lines={null} />
      </div>
    );
  }
  return <PageFrame pageKey={pageKey ?? samplePage} html={content} title={title} className="h-[min(80dvh,60rem)] min-h-96 rounded-lg border" />;
}
