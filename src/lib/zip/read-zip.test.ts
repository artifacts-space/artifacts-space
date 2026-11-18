import { describe, expect, it } from "vitest";

import { readZip, type ZipLimits, type ZipRead } from "./read-zip";
import { buildZip, type TestZip, type TestZipEntry } from "./test-zip";

const limits: ZipLimits = { maxZipBytes: 64 * 1024 * 1024, maxEntries: 50, maxEntryBytes: 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024 };
const decoder = new TextDecoder();

async function read(entries: readonly TestZipEntry[], change?: (zip: TestZip, view: DataView) => void, options: Partial<Parameters<typeof readZip>[1]> = {}): Promise<ZipRead> {
  const zip = await buildZip(entries);
  change?.(zip, new DataView(zip.bytes.buffer));
  return readZip(zip.bytes, { limits, ...options });
}

function filesOf(result: ZipRead): Record<string, string> {
  if (!result.ok) throw new Error(`Expected a read, got ${result.fault}`);
  return Object.fromEntries(result.files.map((file) => [file.name, decoder.decode(file.bytes)]));
}

const faultOf = (result: ZipRead) => (result.ok ? "ok" : result.fault);

describe("readZip", () => {
  it("should unpack a nested site with stored and deflated entries, skipping folder entries, when the zip is whole", async () => {
    const result = await read([
      { name: "site/", method: 0 },
      { name: "site/index.html", data: "<!doctype html><p>Hi</p>", method: 0 },
      { name: "site/css/site.css", data: "body { color: green; }" },
      { name: "site/js/app.js", data: "console.log(1);".repeat(200) },
    ]);
    expect(filesOf(result)).toEqual({
      "site/index.html": "<!doctype html><p>Hi</p>",
      "site/css/site.css": "body { color: green; }",
      "site/js/app.js": "console.log(1);".repeat(200),
    });
  });

  it("should unpack entries of several megabytes whole, stored and deflated, through many pieces", async () => {
    const big = Uint8Array.from({ length: 3 * 1024 * 1024 }, (_, index) => (index * 7919) % 251);
    const result = await read([{ name: "a.wasm", data: big, method: 0 }, { name: "b.wasm", data: big }], undefined, { limits: { ...limits, maxEntryBytes: 4 * 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024 } });
    expect(result.ok && result.files.map((file) => file.bytes.length)).toEqual([big.length, big.length]);
    expect(result.ok && result.files.every((file) => file.bytes.every((byte, index) => byte === big[index]))).toBe(true);
  });

  it("should leave out the names the caller skips without unpacking them, and count them", async () => {
    const seen: string[] = [];
    const result = await read([{ name: "site/.DS_Store", data: "x" }, { name: "__MACOSX/site/._a.css", data: "y" }, { name: "site/a.css", data: "a{}" }], undefined, {
      skip: (name) => { seen.push(name); return name.includes(".DS_Store") || name.startsWith("__MACOSX/"); },
    });
    expect(filesOf(result)).toEqual({ "site/a.css": "a{}" });
    expect(result.ok && result.skipped).toBe(2);
    expect(result.bytesOut).toBe(3);
    expect(seen).toHaveLength(3);
  });

  it("should leave out names that point outside the zip's folder, or that are not readable text, and list each", async () => {
    const result = await read([
      { name: "../evil.js", data: "1" },
      { name: "/etc/evil.js", data: "1" },
      { name: "C:/evil.js", data: "1" },
      { name: "..\\evil.js", data: "1" },
      { name: "css/\u0000.css", data: "1" },
      { name: new Uint8Array([0x63, 0xff, 0xfe, 0x2e, 0x6a, 0x73]), data: "1" },
      { name: "a".repeat(600), data: "1" },
      { name: "css\\site.css", data: "b{}" },
    ]);
    expect(filesOf(result), "a backslash between folders is read as a slash").toEqual({ "css/site.css": "b{}" });
    if (!result.ok) return;
    expect(result.leftOut.map((entry) => entry.reason)).toEqual(["unsafe-name", "unsafe-name", "unsafe-name", "unsafe-name", "unreadable-name", "unreadable-name", "long-name"]);
    expect(result.leftOut[4]?.name, "a control character is never shown as it is").toBe("css/\ufffd.css");
    expect(result.leftOut[5]?.name).toContain("\ufffd");
  });

  it("should keep the last of two entries at one name and say the earlier was left out", async () => {
    const result = await read([{ name: "a.css", data: "first" }, { name: "b.css", data: "b" }, { name: "a.css", data: "second" }]);
    expect(filesOf(result)).toEqual({ "a.css": "second", "b.css": "b" });
    expect(result.ok && result.leftOut).toEqual([{ name: "a.css", reason: "duplicate" }]);
  });

  it("should leave out a symbolic link, by its Unix mode", async () => {
    const result = await read([{ name: "link.css", data: "../../etc/passwd", madeBy: (3 << 8) | 20, externalAttributes: (0o120777 << 16) >>> 0 }, { name: "a.css", data: "a" }]);
    expect(filesOf(result)).toEqual({ "a.css": "a" });
    expect(result.ok && result.leftOut).toEqual([{ name: "link.css", reason: "special" }]);
  });

  it("should refuse an encrypted entry, in the central or the local header", async () => {
    expect(faultOf(await read([{ name: "a.css", data: "a", flags: 1 }]))).toBe("encrypted");
    expect(faultOf(await read([{ name: "a.css", data: "a" }], (zip, view) => { view.setUint16((zip.localAt[0] ?? 0) + 6, 1, true); }))).toBe("encrypted");
  });

  it("should refuse a zip64 marker in an entry, in the end record, or as a zip64 locator", async () => {
    expect(faultOf(await read([{ name: "a.css", data: "a" }], (zip, view) => { view.setUint32((zip.centralAt[0] ?? 0) + 20, 0xffffffff, true); }))).toBe("zip64");
    expect(faultOf(await read([{ name: "a.css", data: "a" }], (zip, view) => { view.setUint16(zip.endAt + 10, 0xffff, true); }))).toBe("zip64");
    const zip = await buildZip([{ name: "a.css", data: "a".repeat(40) }]);
    // A zip64 locator just before the end record.
    new DataView(zip.bytes.buffer).setUint32(zip.endAt - 20, 0x07064b50, true);
    expect(faultOf(await readZip(zip.bytes, { limits }))).toBe("zip64");
  });

  it("should refuse a zip that is one part of several", async () => {
    expect(faultOf(await read([{ name: "a.css", data: "a" }], (zip, view) => { view.setUint16(zip.endAt + 4, 1, true); }))).toBe("split");
  });

  it("should refuse a compression method other than stored or deflate", async () => {
    expect(faultOf(await read([{ name: "a.css", data: "a", method: 0, methodCode: 12 }]))).toBe("method");
  });

  it("should end in a plain fault, never a throw or a hang, when the zip is cut short anywhere", async () => {
    const zip = await buildZip([{ name: "site/a.css", data: "a{}".repeat(100) }, { name: "site/b.js", data: "1;".repeat(100), method: 0 }]);
    const cuts = [4, 31, (zip.localAt[1] ?? 0) + 3, (zip.localAt[1] ?? 0) + 40, (zip.centralAt[0] ?? 0) + 10, (zip.centralAt[1] ?? 0) + 50, zip.endAt + 10, zip.bytes.length - 1];
    for (const cut of cuts) {
      const result = await readZip(zip.bytes.slice(0, cut), { limits });
      expect(faultOf(result), `cut at ${String(cut)}`).toBe("damaged");
    }
  });

  it("should refuse a directory or an entry that points outside the file, or entries that share their data", async () => {
    expect(faultOf(await read([{ name: "a.css", data: "a" }], (zip, view) => { view.setUint32(zip.endAt + 16, 0x7fffffff, true); }))).toBe("damaged");
    expect(faultOf(await read([{ name: "a.css", data: "a" }], (zip, view) => { view.setUint32((zip.centralAt[0] ?? 0) + 42, 0x7ffffff0, true); }))).toBe("damaged");
    expect(faultOf(await read([{ name: "a.css", data: "a" }], (zip, view) => { view.setUint16(zip.endAt + 8, 9, true); view.setUint16(zip.endAt + 10, 9, true); })), "a count the directory's bytes cannot hold").toBe("damaged");
    expect(faultOf(await read([{ name: "a.css", data: "a" }, { name: "b.css", data: "b" }], (zip, view) => { view.setUint32((zip.centralAt[1] ?? 0) + 42, zip.localAt[0] ?? 0, true); }))).toBe("damaged");
  });

  it("should stop inflating an entry the moment it passes its declared size, having read little of what it would unpack to", async () => {
    const tenMegabytes = new Uint8Array(10 * 1024 * 1024);
    const result = await read([{ name: "bomb.css", data: tenMegabytes, declaredSize: 1000 }]);
    expect(faultOf(result)).toBe("damaged");
    expect(result.bytesOut).toBeGreaterThan(1000);
    expect(result.bytesOut, "it stopped within one chunk of the declared size").toBeLessThan(1000 + 256 * 1024);
  });

  it("should refuse a zip whose declared sizes add up past the total, before unpacking anything", async () => {
    const result = await read([{ name: "a.css", data: "a" }, { name: "b.css", data: "b" }], undefined, { limits: { ...limits, maxTotalBytes: 1 } });
    expect(faultOf(result)).toBe("unpacks-too-large");
    expect(result.bytesOut).toBe(0);
  });

  it("should list an entry over the largest file by its declared size and never unpack it", async () => {
    const result = await read([{ name: "big.mp4", data: new Uint8Array(4096) }, { name: "a.css", data: "a" }], undefined, { limits: { ...limits, maxEntryBytes: 1000 } });
    expect(filesOf(result)).toEqual({ "a.css": "a" });
    expect(result.ok && result.tooLarge).toEqual([{ name: "big.mp4", size: 4096 }]);
    expect(result.bytesOut).toBe(1);
  });

  it("should refuse bytes that do not match their CRC-32 or a stored size that differs from its data", async () => {
    expect(faultOf(await read([{ name: "a.css", data: "abc", method: 0 }], (zip) => { zip.bytes[(zip.localAt[0] ?? 0) + 30 + 5] = 0x78; }))).toBe("damaged");
    expect(faultOf(await read([{ name: "a.css", data: "abc", method: 0, declaredSize: 2 }]))).toBe("damaged");
  });

  it("should refuse a zip with more entries than the cap before reading any", async () => {
    const entries = Array.from({ length: 51 }, (_, index) => ({ name: `f${String(index)}.css`, data: "a" }));
    expect(faultOf(await read(entries))).toBe("too-many-entries");
  });

  it("should refuse an empty zip, and a zip that holds only folders", async () => {
    expect(faultOf(await read([]))).toBe("empty");
    expect(faultOf(await read([{ name: "site/", method: 0 }, { name: "site/css/", method: 0 }]))).toBe("empty");
  });

  it("should say a text file named .zip is not a zip, and refuse a zip over the size cap without reading it", async () => {
    const text = new TextEncoder().encode("These are my notes, not a zip.\n".repeat(20));
    expect(faultOf(await readZip(text, { limits }))).toBe("not-zip");
    expect(faultOf(await readZip(new Uint8Array(0), { limits }))).toBe("not-zip");
    const zip = await buildZip([{ name: "a.css", data: "a" }]);
    expect(faultOf(await readZip(zip.bytes, { limits: { ...limits, maxZipBytes: 10 } }))).toBe("too-large");
  });

  it("should stop when the signal is aborted, and report progress up to the whole", async () => {
    const stop = new AbortController();
    stop.abort();
    expect(faultOf(await read([{ name: "a.css", data: "a" }], undefined, { signal: stop.signal }))).toBe("cancelled");
    const fractions: number[] = [];
    await read([{ name: "a.css", data: "a".repeat(5000) }, { name: "b.css", data: "b".repeat(5000) }], undefined, { onProgress: (fraction) => { fractions.push(fraction); } });
    expect(fractions.at(-1)).toBe(1);
    expect(fractions.every((fraction, index) => index === 0 || fraction >= (fractions[index - 1] ?? 0))).toBe(true);
  });
});
