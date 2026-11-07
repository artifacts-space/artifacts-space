import { CodeBlock } from "@/components/code-block";
import { InlineCodeText } from "@/components/docs/docs-content";
import { PropsTable } from "@/components/docs/live-example";
import type { DocsMcpTool } from "@/lib/docs/mcp-tools";
import type { ToolResultDoc } from "@/lib/docs/mcp-results";
import { cn } from "@/lib/utils";

/** A read or write badge, as tool-access.ts classifies the tool. */
export function AccessBadge({ access }: { access: "read" | "write" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-sans text-xs font-normal",
        access === "read" ? "text-muted-foreground" : "border-tone-warning/40 text-tone-warning",
      )}
    >
      {access}
    </span>
  );
}

/**
 * One MCP tool in the reference: name, access, title, description, arguments
 * (from its zod input schema), and what it returns.
 */
export function McpToolEntry({ tool, result }: { tool: DocsMcpTool; result: ToolResultDoc }) {
  return (
    <article id={tool.name} className="card-surface mt-8 scroll-mt-20 px-4 py-5 sm:px-6" aria-labelledby={`${tool.name}-name`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 id={`${tool.name}-name`} className="font-mono text-lg font-medium break-all">
          <a href={`#${tool.name}`} className="hover:underline hover:underline-offset-4">{tool.name}</a>
        </h4>
        <AccessBadge access={tool.access} />
        <span className="text-sm text-muted-foreground">{tool.title}</span>
      </header>
      <p className="mt-3 text-md leading-7 text-muted-foreground">
        <InlineCodeText text={tool.description} />
      </p>
      <h5 className="mt-5 text-sm font-medium">Arguments</h5>
      <PropsTable rows={tool.args} label="Argument" />
      <h5 className="mt-5 text-sm font-medium">Returns</h5>
      <p className="mt-2 text-md leading-7 text-muted-foreground">
        <InlineCodeText text={result.summary} />
      </p>
      {result.shape ? <CodeBlock title="Result, abridged" value={result.shape} className="mt-3" /> : null}
    </article>
  );
}
