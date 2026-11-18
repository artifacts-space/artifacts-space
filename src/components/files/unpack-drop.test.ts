import { describe, expect, it } from "vitest";

import { routeDrop } from "@/lib/page-files/drop-rules";
import { cannotUnpackWords, unreadableZipWords, zipFaultWords } from "@/lib/page-files/zip-rules";
import { buildZip, type TestZipEntry } from "@/lib/zip/test-zip";

import type { DroppedFile } from "./dropped-files";
import { unpackDrop, unpackFailed, type UnpackOptions } from "./unpack-drop";

async function zipFile(name: string, entries: readonly TestZipEntry[]): Promise<DroppedFile> {
  const zip = await buildZip(entries);
  return { file: new File([zip.bytes], name, { type: "application/zip" }), relativePath: name, fromFolder: false };
}

function loose(name: string, text = "a"): DroppedFile {
  return { file: new File([text], name), relativePath: name, fromFolder: false };
}

const options = (overrides: Partial<UnpackOptions> = {}): UnpackOptions => ({ signal: new AbortController().signal, onProgress: () => undefined, ...overrides });

const site: TestZipEntry[] = [
  { name: "site/", method: 0 },
  { name: "site/index.html", data: "<!doctype html><link rel=\"stylesheet\" href=\"css/site.css\">" },
  { name: "site/css/site.css", data: "body { color: green; }" },
  { name: "site/.DS_Store", data: "x" },
  { name: "site/.git/config", data: "[core]" },
  { name: "__MACOSX/site/._index.html", data: "x" },
];

describe("unpackDrop", () => {
  it("should hand on a zip's files as a dropped folder's, so the drop's rules give them the same paths", async () => {
    const drop = await unpackDrop([await zipFile("site.zip", site)], options());
    expect(drop?.files.map((entry) => [entry.relativePath, entry.file.name, entry.fromFolder])).toEqual([["site/index.html", "index.html", true], ["site/css/site.css", "site.css", true]]);
    expect(await drop?.files[1]?.file.text()).toBe("body { color: green; }");
    expect(drop?.leftOut, "hidden and system files are left out quietly, as from a folder").toBe(3);
    expect(drop?.sources.map(({ name, count }) => ({ name, count }))).toEqual([{ name: "site.zip", count: 2 }]);
    const routes = routeDrop((drop?.files ?? []).map(({ file, relativePath, fromFolder }) => ({ name: file.name, size: file.size, type: file.type, relativePath, fromFolder })));
    expect(routes).toEqual([{ kind: "page-html", path: "index.html" }, { kind: "page", path: "css/site.css" }]);
  });

  it("should keep a drop's loose files in their places beside a zip's files, and unpack each zip", async () => {
    const drop = await unpackDrop([loose("logo.svg"), await zipFile("a.zip", [{ name: "a.css", data: "a" }]), await zipFile("b.zip", [{ name: "a.css", data: "b" }])], options());
    expect(drop?.files.map((entry) => entry.relativePath)).toEqual(["logo.svg", "a.css", "a.css"]);
    expect(drop?.sources.map((source) => source.name)).toEqual(["a.zip", "b.zip"]);
  });

  it("should refuse a zip that cannot be unpacked with the reason, add nothing from it, and keep the rest of the drop", async () => {
    const locked = await zipFile("locked.zip", [{ name: "a.css", data: "a", flags: 1 }]);
    const drop = await unpackDrop([locked, loose("b.css")], options());
    expect(drop?.refused).toEqual([{ name: "locked.zip", problem: "This zip is locked with a password. Unpack it and drop the folder." }]);
    expect(drop?.files.map((entry) => entry.relativePath)).toEqual(["b.css"]);
    expect(drop?.sources).toEqual([]);
  });

  it("should say a file named .zip that is not one is not a zip", async () => {
    const drop = await unpackDrop([loose("notes.zip", "plain text, not a zip")], options());
    expect(drop?.refused).toEqual([{ name: "notes.zip", problem: zipFaultWords("not-zip", 0) }]);
  });

  it("should say the browser cannot unpack a zip, and add nothing from it, when it has no DecompressionStream", async () => {
    const drop = await unpackDrop([await zipFile("site.zip", site)], options({ canUnpack: false }));
    expect(drop?.refused).toEqual([{ name: "site.zip", problem: cannotUnpackWords }]);
    expect(drop?.files).toEqual([]);
  });

  it("should list unsafe names and earlier duplicates by name and zip, and refuse a file over the largest size as a folder's file would be", async () => {
    const drop = await unpackDrop([await zipFile("site.zip", [{ name: "../evil.js", data: "1" }, { name: "a.css", data: "1" }, { name: "a.css", data: "2" }, { name: "film.mp4", data: "x", declaredSize: 30 * 1024 * 1024 }])], options());
    expect(drop?.refused.map((entry) => entry.name)).toEqual(["../evil.js (in site.zip)", "a.css (in site.zip)", "film.mp4 (in site.zip)"]);
    expect(drop?.refused[2]?.problem).toBe("The file is 30 MB. The limit is 25 MB.");
    expect(drop?.files.map((entry) => entry.relativePath)).toEqual(["a.css"]);
    expect(await drop?.files[0]?.file.text()).toBe("2");
  });

  it("should add nothing when the signal stops it", async () => {
    const stop = new AbortController();
    stop.abort();
    expect(await unpackDrop([await zipFile("site.zip", site), loose("b.css")], options({ signal: stop.signal }))).toBeNull();
  });

  it("should leave a zip inside a dropped folder as a file of that folder", async () => {
    const inFolder = { ...(await zipFile("archive.zip", site)), relativePath: "site/archive.zip", fromFolder: true };
    const drop = await unpackDrop([inFolder], options());
    expect(drop?.files).toEqual([inFolder]);
  });

  it("should say nothing of where files came from when none of a zip's files went on", async () => {
    const drop = await unpackDrop([await zipFile("hidden.zip", [{ name: ".DS_Store", data: "x" }, { name: "__MACOSX/._a.css", data: "y" }])], options());
    expect(drop?.files).toEqual([]);
    expect(drop?.leftOut).toBe(2);
    expect(drop?.sources).toEqual([]);
  });

  it("should keep a drop's other files and say each zip could not be read when unpacking fails unexpectedly", async () => {
    const zip = await zipFile("site.zip", site);
    const other = loose("b.css");
    expect(unpackFailed([zip, other])).toEqual({ files: [other], refused: [{ name: "site.zip", problem: unreadableZipWords }], leftOut: 0, sources: [] });
  });
});
