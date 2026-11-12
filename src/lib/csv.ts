/** Field separators the parser recognizes. */
export type CsvDelimiter = "," | ";" | "\t";

export interface CsvParseOptions {
  /** Most data rows to keep. Rows past the cap are counted, not stored. Default 1,000. */
  maxRows?: number;
  /** Field separator. Detected from the first line when omitted. */
  delimiter?: CsvDelimiter;
}

export interface CsvParseResult {
  /** The first record. */
  header: string[];
  /** Data rows after the header, at most `maxRows`. */
  rows: string[][];
  /** Every data row in the input, including rows past the cap. */
  totalRows: number;
  /** True when rows were cut at `maxRows`. */
  truncated: boolean;
  /** The widest record's field count. */
  columnCount: number;
  delimiter: CsvDelimiter;
  /** Problems found, such as a quote that never closes. Parsing still returns what it read. */
  errors: string[];
}

const candidates: CsvDelimiter[] = [",", ";", "\t"];

/** Picks the separator that appears most often, outside quotes, in the first line. */
export function detectDelimiter(text: string): CsvDelimiter {
  const line = firstLineOutsideQuotes(text);
  const count = (candidate: CsvDelimiter) => line.split(candidate).length - 1;
  return candidates.reduce<CsvDelimiter>((best, candidate) => (count(candidate) > count(best) ? candidate : best), ",");
}

/** The first record's text with quoted sections removed. */
function firstLineOutsideQuotes(text: string): string {
  let quoted = false;
  let line = "";
  for (const char of text) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === "\n" || char === "\r") break;
    line += char;
  }
  return line;
}

class RecordCollector {
  header: string[] = [];
  rows: string[][] = [];
  totalRows = 0;
  columnCount = 0;
  private seenHeader = false;
  // A plain field, not a parameter property: Node's type stripping (the owner scripts load this file) cannot emit one.
  private readonly maxRows: number;

  constructor(maxRows: number) {
    this.maxRows = maxRows;
  }

  push(record: string[]) {
    this.columnCount = Math.max(this.columnCount, record.length);
    if (!this.seenHeader) {
      this.header = record;
      this.seenHeader = true;
      return;
    }
    this.totalRows += 1;
    if (this.rows.length < this.maxRows) this.rows.push(record);
  }
}

/** Mutable cursor state for one parse. */
interface Cursor {
  field: string;
  record: string[];
  quoted: boolean;
  /** True once the current field started with a quote. */
  wasQuoted: boolean;
}

function endRecord(cursor: Cursor, collector: RecordCollector) {
  cursor.record.push(cursor.field);
  // A blank line is not a record.
  if (!(cursor.record.length === 1 && cursor.record[0] === "" && !cursor.wasQuoted)) collector.push(cursor.record);
  cursor.record = [];
  cursor.field = "";
  cursor.wasQuoted = false;
}

function quotedStep(cursor: Cursor, char: string, next: string | undefined): number {
  if (char !== '"') {
    cursor.field += char;
    return 1;
  }
  if (next === '"') {
    cursor.field += '"';
    return 2;
  }
  cursor.quoted = false;
  return 1;
}

function plainStep(cursor: Cursor, collector: RecordCollector, char: string, next: string | undefined, delimiter: CsvDelimiter): number {
  if (char === '"' && cursor.field === "") {
    cursor.quoted = true;
    cursor.wasQuoted = true;
    return 1;
  }
  if (char === delimiter) {
    cursor.record.push(cursor.field);
    cursor.field = "";
    cursor.wasQuoted = false;
    return 1;
  }
  if (char === "\r" || char === "\n") {
    endRecord(cursor, collector);
    return char === "\r" && next === "\n" ? 2 : 1;
  }
  cursor.field += char;
  return 1;
}

/** Reads every character, feeding finished records to `collector`. Returns the cursor at the end. */
function scan(source: string, delimiter: CsvDelimiter, collector: RecordCollector): Cursor {
  const cursor: Cursor = { field: "", record: [], quoted: false, wasQuoted: false };
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    const next = index + 1 < source.length ? source.charAt(index + 1) : undefined;
    index += cursor.quoted ? quotedStep(cursor, char, next) : plainStep(cursor, collector, char, next, delimiter);
  }
  return cursor;
}

/**
 * Parses CSV as described in RFC 4180: quoted fields may hold separators,
 * line breaks, and doubled quotes; CRLF, LF, and CR all end a record; a
 * leading byte-order mark is ignored. Lenient on bad input: it never throws
 * and reports problems in `errors`.
 */
export function parseCsv(text: string, options: CsvParseOptions = {}): CsvParseResult {
  const source = text.startsWith("﻿") ? text.slice(1) : text;
  const delimiter = options.delimiter ?? detectDelimiter(source);
  const collector = new RecordCollector(Math.max(0, options.maxRows ?? 1000));
  const cursor = scan(source, delimiter, collector);
  const errors = cursor.quoted ? ["A quoted field never closes. Check for a missing closing quote."] : [];
  if (cursor.field !== "" || cursor.record.length > 0 || cursor.wasQuoted) endRecord(cursor, collector);
  return {
    header: collector.header,
    rows: collector.rows,
    totalRows: collector.totalRows,
    truncated: collector.totalRows > collector.rows.length,
    columnCount: collector.columnCount,
    delimiter,
    errors,
  };
}

/** How a CSV file writes records, so a save keeps the file's own style. */
export interface CsvTextStyle {
  delimiter: CsvDelimiter;
  /** The line break between records. */
  newline: "\n" | "\r\n";
  /** True when the last record ends with a line break. */
  trailingNewline: boolean;
}

/** Reads the separator, line break, and final line break that `text` uses. */
export function csvTextStyle(text: string): CsvTextStyle {
  return {
    delimiter: detectDelimiter(text),
    newline: text.includes("\r\n") ? "\r\n" : "\n",
    trailingNewline: text.endsWith("\n") || text.endsWith("\r"),
  };
}

const quoteTrigger = /["\r\n]/;

/** One field, quoted when it holds the separator, a quote, or a line break. Quotes inside are doubled. */
export function serializeCsvField(field: string, delimiter: CsvDelimiter = ","): string {
  if (!field.includes(delimiter) && !quoteTrigger.test(field)) return field;
  return `"${field.replaceAll('"', '""')}"`;
}

/** Any separator the parser might detect. Header fields holding one are quoted, so detection stays right. */
const anySeparator = /[,;\t]/;

function serializeRecord(record: readonly string[], delimiter: CsvDelimiter, isHeader: boolean): string {
  // A lone empty field would read back as a blank line, which is not a record.
  if (record.length === 0 || (record.length === 1 && record[0] === "")) return '""';
  const field = (value: string) => (isHeader && anySeparator.test(value) ? `"${value.replaceAll('"', '""')}"` : serializeCsvField(value, delimiter));
  return record.map(field).join(delimiter);
}

/**
 * Writes a header and rows as RFC 4180 CSV. Fields are quoted only when they
 * must be, so `parseCsv(serializeCsv(header, rows))` gives back the same
 * header and rows. Ragged rows stay ragged. Header names that hold any
 * separator are quoted too, so the file's separator is still detected.
 */
export function serializeCsv(header: readonly string[], rows: readonly (readonly string[])[], style: Partial<CsvTextStyle> = {}): string {
  const delimiter = style.delimiter ?? ",";
  const newline = style.newline ?? "\r\n";
  if (header.length === 0 && rows.length === 0) return "";
  const text = [header, ...rows].map((record, index) => serializeRecord(record, delimiter, index === 0)).join(newline);
  return style.trailingNewline ? text + newline : text;
}
