import { IconChevronRight } from "@tabler/icons-react";

import { CodeSnippet } from "@/components/code/code-snippet";
import { CopyButton } from "@/components/copy-button";
import { specJson, type DocExample } from "@/lib/docs/spec-builders";
import type { PropRow } from "@/lib/docs/prop-rows";
import { cn } from "@/lib/utils";

import { InlineCodeText } from "./docs-content";
import { ExamplePreview } from "./example-preview";
import { ScrollFrame } from "./scroll-frame";

/**
 * The spec under a live example, behind a quiet "Show JSON" toggle. The JSON
 * is the shared code block's highlighted code, so it matches every other code
 * block in the docs. Focus shows the standard ring for the keyboard only.
 */
export function ExampleSource({ title, json, open }: { title: string; json: string; open: boolean }) {
  return (
    <details className="group border-t" open={open}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-4 text-sm text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <IconChevronRight aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-90" />
        <span className="group-open:hidden">Show JSON</span>
        <span className="hidden group-open:inline">Hide JSON</span>
      </summary>
      <CodeSnippet code={json} language="json" title={`${title} JSON`} variant="embedded" capHeight className="border-t border-code-border" />
    </details>
  );
}

/**
 * One live example: the rendered spec on top and its JSON underneath, with a
 * Copy JSON button. The JSON is exactly what an agent would save.
 */
export function LiveExample({ example, className, jsonOpen = true }: { example: DocExample; className?: string; jsonOpen?: boolean }) {
  const json = specJson(example.spec);
  return (
    <figure className={cn("mt-6 min-w-0 overflow-hidden rounded-lg border", className)} data-docs-example={example.title}>
      <figcaption className="flex min-h-11 items-center justify-between gap-3 border-b bg-muted/40 px-4 py-1.5">
        <span className="min-w-0 truncate text-sm font-medium">{example.title}</span>
        <CopyButton value={json} label="Copy JSON" variant="ghost" size="sm" />
      </figcaption>
      {example.note ? <p className="border-b px-4 py-2 text-sm text-muted-foreground">{example.note}</p> : null}
      <div className="min-w-0 bg-background p-4 sm:p-6" data-docs-preview="">
        <ExamplePreview json={json} />
      </div>
      <ExampleSource title={example.title} json={json} open={jsonOpen} />
    </figure>
  );
}

/**
 * A props or arguments table built from a zod schema. `of` names what the
 * rows belong to (a tool or a component), so the frame that scrolls it
 * sideways on a phone is a group named "<of> arguments" or "<of> props".
 */
export function PropsTable({ rows, of, label = "Prop" }: { rows: PropRow[]; of: string; label?: string }) {
  if (rows.length === 0) return <p className="mt-4 text-md text-muted-foreground">No arguments.</p>;
  return (
    <ScrollFrame label={`${of} ${label.toLowerCase()}s`} className="card-surface mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/50">
          <tr>
            {[label, "Type", "Limits and defaults"].map((cell) => <th key={cell} scope="col" className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">{cell}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t align-top">
              <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ paddingLeft: `${String(0.75 + row.depth * 1)}rem` }}>
                {row.name}
                {row.required ? <span className="ml-1.5 font-sans text-xs text-tone-warning">required</span> : null}
              </td>
              <td className="max-w-[22rem] px-3 py-2 font-mono text-muted-foreground break-words">{row.type}</td>
              <td className="min-w-[12rem] px-3 py-2 text-muted-foreground">
                <InlineCodeText text={[...row.constraints, row.description].filter(Boolean).join(". ") || "—"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollFrame>
  );
}
