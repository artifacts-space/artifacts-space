import { toolRows, type ToolRow } from "@/lib/mcp/tool-summaries";

const rows = toolRows();

const groups = [
  {
    access: "read",
    title: "Read",
    note: "Every connection can use these.",
    rows: rows.filter((row) => row.access === "read"),
  },
  {
    access: "write",
    title: "Write",
    note: "Full access only. Read-only connections never see these.",
    rows: rows.filter((row) => row.access === "write"),
  },
] as const;

/** The MCP tools, grouped by read and write, generated from the server's own tool list. */
export function McpToolsTable() {
  return (
    <div className="mt-3 grid gap-5">
      {groups.map((group) => (
        <ToolGroup key={group.access} title={group.title} note={group.note} rows={group.rows} />
      ))}
    </div>
  );
}

function ToolGroup({ title, note, rows: groupRows }: { title: string; note: string; rows: readonly ToolRow[] }) {
  const headingId = `mcp-tools-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h4 id={headingId} className="text-sm font-medium">
          {title} <span className="font-normal text-muted-foreground">({String(groupRows.length)})</span>
        </h4>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      <dl className="mt-2 border-b">
        {groupRows.map((row) => (
          <div key={row.name} className="grid gap-0.5 border-t py-2 sm:grid-cols-[13.5rem_1fr] sm:gap-4">
            <dt className="font-mono text-sm break-all">{row.name}</dt>
            <dd className="text-sm leading-5 text-muted-foreground">{row.summary}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
