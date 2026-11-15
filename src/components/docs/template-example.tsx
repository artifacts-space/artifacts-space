"use client";

import { useMemo } from "react";

import { CopyButton } from "@/components/copy-button";

import { ExamplePreview } from "./example-preview";

/**
 * One section template on its category's docs page: the template drawn live,
 * with a Copy JSON button. It takes the spec once, as compact JSON; the copy
 * is indented in the browser, so the page never carries a spec twice.
 */
export function TemplateExample({ id, json }: { id: string; json: string }) {
  const indented = useMemo(() => JSON.stringify(JSON.parse(json), null, 2), [json]);
  return (
    <figure className="mt-4 min-w-0 overflow-hidden rounded-lg border" data-docs-template={id}>
      <figcaption className="flex min-h-11 items-center justify-between gap-3 border-b bg-muted/40 px-4 py-1.5">
        <span className="min-w-0 truncate font-mono text-sm">{id}</span>
        <CopyButton value={indented} label="Copy JSON" variant="ghost" size="sm" />
      </figcaption>
      <div className="min-w-0 bg-background" data-docs-preview="">
        <ExamplePreview json={json} />
      </div>
    </figure>
  );
}
