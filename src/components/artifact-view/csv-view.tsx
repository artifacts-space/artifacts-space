import { CsvTable } from "./csv-table";

export { csvColumnCap, csvRowCap } from "@/lib/csv-limits";

/**
 * CSV as a sortable, filterable table with a sticky header. Rows and
 * columns past the caps are cut, with a note. Sorting and filtering change
 * only what the reader sees, never the stored file.
 */
export function CsvView({ content }: { content: string }) {
  return <CsvTable content={content} />;
}
