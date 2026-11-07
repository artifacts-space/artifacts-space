import { parseCsv } from "@/lib/csv";
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

/** Rows and columns shown before the CSV view cuts the rest. */
export const csvRowCap = 1000;
export const csvColumnCap = 50;

/** CSV as a table with a sticky header. Rows and columns past the caps are cut, with a note. */
export function CsvView({ content }: { content: string }) {
  const parsed = parseCsv(content, { maxRows: csvRowCap });
  const columns = Math.min(Math.max(parsed.columnCount, parsed.header.length), csvColumnCap);
  const indexes = Array.from({ length: columns }, (_, index) => index);
  if (parsed.header.length === 0) return <ViewNotice title="This CSV has no rows yet." />;
  const notes = [
    parsed.truncated ? `Showing the first ${csvRowCap.toLocaleString("en-US")} of ${parsed.totalRows.toLocaleString("en-US")} rows.` : null,
    parsed.columnCount > csvColumnCap ? `Showing the first ${String(csvColumnCap)} of ${String(parsed.columnCount)} columns.` : null,
    ...parsed.errors,
  ].filter((note): note is string => note !== null);
  return (
    <div className="min-w-0 space-y-3">
      <div tabIndex={0} role="region" aria-label="CSV table" className="max-h-[70vh] overflow-auto rounded-md border bg-card shadow-xs focus-visible:outline-2 focus-visible:outline-ring">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th scope="col" className="w-10 border-b px-3 py-2 text-right font-normal text-muted-foreground/70">#</th>
              {indexes.map((index) => (
                <th key={index} scope="col" className="border-b px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                  <span className="inline-block max-w-[28ch] truncate align-bottom">{parsed.header[index] ?? ""}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b last:border-b-0 even:bg-muted/30">
                <td className="px-3 py-1.5 text-right align-top text-muted-foreground/70 tabular-nums">{rowIndex + 1}</td>
                {indexes.map((index) => <td key={index} className="max-w-[40ch] px-3 py-1.5 align-top wrap-anywhere">{row[index] ?? ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {parsed.rows.length === 0 ? <p className="text-sm text-muted-foreground">Only a header row so far.</p> : null}
      {notes.length > 0 ? <p className="text-sm text-muted-foreground">{notes.join(" ")}</p> : null}
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
