import { crc32 } from "./crc32";

/*
 * Tests only: a tiny zip writer, so unit and browser tests build the zips
 * they read by hand (stored and deflated entries), and can then break them
 * on purpose through the offsets it returns. Never imported by the app.
 */

/** One entry to write. Anything left out is written as a normal zip tool would. */
export interface TestZipEntry {
  name: string | Uint8Array;
  data?: string | Uint8Array;
  /** 0 stored, 8 deflated (the default for files). */
  method?: 0 | 8;
  /** The method number written in the headers, to write one no reader knows. */
  methodCode?: number;
  flags?: number;
  /** The uncompressed size the headers declare, in place of the real one. */
  declaredSize?: number;
  /** Version made by: the host in the high byte (3 is Unix). */
  madeBy?: number;
  externalAttributes?: number;
}

/** A written zip, with where each part sits so a test can change it. */
export interface TestZip {
  bytes: Uint8Array<ArrayBuffer>;
  localAt: number[];
  centralAt: number[];
  endAt: number;
}

const encoder = new TextEncoder();

function asBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? encoder.encode(value) : value;
}

/** Deflates bytes as zip's method 8 does, with the platform's compressor. */
export async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface Written { name: Uint8Array; data: Uint8Array; packed: Uint8Array; method: number; entry: TestZipEntry }

async function prepare(entry: TestZipEntry): Promise<Written> {
  const name = asBytes(entry.name);
  const data = asBytes(entry.data ?? "");
  const method = entry.method ?? 8;
  const packed = method === 8 ? await deflateRaw(data) : data;
  return { name, data, packed, method: entry.methodCode ?? method, entry };
}

function header(length: number, fill: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(length);
  fill(new DataView(bytes.buffer));
  return bytes;
}

function localHeader(written: Written): Uint8Array {
  return header(30, (view) => {
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, written.entry.flags ?? 0, true);
    view.setUint16(8, written.method, true);
    view.setUint32(14, crc32(written.data), true);
    view.setUint32(18, written.packed.length, true);
    view.setUint32(22, written.entry.declaredSize ?? written.data.length, true);
    view.setUint16(26, written.name.length, true);
  });
}

function centralHeader(written: Written, localAt: number): Uint8Array {
  return header(46, (view) => {
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, written.entry.madeBy ?? 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, written.entry.flags ?? 0, true);
    view.setUint16(10, written.method, true);
    view.setUint32(16, crc32(written.data), true);
    view.setUint32(20, written.packed.length, true);
    view.setUint32(24, written.entry.declaredSize ?? written.data.length, true);
    view.setUint16(28, written.name.length, true);
    view.setUint32(38, written.entry.externalAttributes ?? 0, true);
    view.setUint32(42, localAt, true);
  });
}

function endRecord(count: number, directorySize: number, directoryStart: number): Uint8Array {
  return header(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, count, true);
    view.setUint16(10, count, true);
    view.setUint32(12, directorySize, true);
    view.setUint32(16, directoryStart, true);
  });
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  return bytes;
}

/** Writes a zip of these entries, in order. */
export async function buildZip(entries: readonly TestZipEntry[]): Promise<TestZip> {
  const written = await Promise.all(entries.map(prepare));
  const parts: Uint8Array[] = [];
  const localAt: number[] = [];
  let at = 0;
  for (const entry of written) {
    localAt.push(at);
    const local = localHeader(entry);
    parts.push(local, entry.name, entry.packed);
    at += local.length + entry.name.length + entry.packed.length;
  }
  const directoryStart = at;
  const centralAt: number[] = [];
  written.forEach((entry, index) => {
    centralAt.push(at);
    const central = centralHeader(entry, localAt[index] ?? 0);
    parts.push(central, entry.name);
    at += central.length + entry.name.length;
  });
  parts.push(endRecord(written.length, at - directoryStart, directoryStart));
  return { bytes: concat(parts), localAt, centralAt, endAt: at };
}
