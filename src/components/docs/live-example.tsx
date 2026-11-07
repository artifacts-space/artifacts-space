import { CopyButton } from "@/components/copy-button";
import { specJson, type DocExample } from "@/lib/docs/spec-builders";
import type { PropRow } from "@/lib/docs/prop-rows";
import { cn } from "@/lib/utils";

import { ExamplePreview } from "./example-preview";

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
      <details className="group border-t" open={jsonOpen}>
        <summary className="cursor-pointer px-4 py-2.5 text-sm text-muted-foreground select-none hover:text-foreground">JSON</summary>
        <pre tabIndex={0} className="max-h-[28rem] overflow-auto border-t bg-muted/30 px-4 py-3 font-mono text-sm leading-6"><code>{json}</code></pre>
      </details>
    </figure>
  );
}

/** A props or arguments table built from a zod schema. */
export function PropsTable({ rows, label = "Prop" }: { rows: PropRow[]; label?: string }) {
  if (rows.length === 0) return <p className="mt-4 text-md text-muted-foreground">No arguments.</p>;
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border">
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
                {[...row.constraints, row.description].filter(Boolean).join(". ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
