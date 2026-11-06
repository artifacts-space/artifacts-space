"use client";

import { CopyButton } from "@/components/copy-button";
import { MarkdownView } from "@/components/artifact-view/markdown-view";

import { CodeBlock } from "./content";
import type { ViewProps } from "./stout";

/** A numbered how-to: each step has a title, optional Markdown body, and optional code with a copy button. */
export function StepsView({ props }: ViewProps<"Steps">) {
  return (
    <section className="min-w-0 space-y-3" aria-label={props.title ?? "Steps"}>
      {props.title ? <p className="text-md font-medium break-words">{props.title}</p> : null}
      {props.items.length === 0 ? <p className="text-sm text-muted-foreground">No steps yet.</p> : null}
      <ol className="min-w-0">
        {props.items.map((step, index) => (
          <li key={`${String(index)}-${step.title}`} className="relative flex gap-3 pb-6 last:pb-0">
            {index < props.items.length - 1 ? <span aria-hidden className="absolute top-8 bottom-1.5 left-[13px] w-px bg-border" /> : null}
            <span aria-hidden className="flex size-[27px] shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <p className="text-md leading-6 font-medium break-words">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </p>
              {step.body?.trim() ? <MarkdownView content={step.body} className="text-md leading-6 text-foreground/85" /> : null}
              {step.code ? (
                <CodeBlock code={step.code} language={step.language} actions={<CopyButton value={step.code} variant="ghost" size="icon-xs" />} />
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
