import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fontIdsFor, fontPreloadHref, fontStylesheet, themeFonts } from "./fonts";

const publicDir = join(process.cwd(), "public");

describe("theme fonts", () => {
  it("should keep display faces out of body text and mono faces in the mono slot only", () => {
    expect(fontIdsFor("body")).not.toContain("instrument-serif");
    expect(fontIdsFor("body")).not.toContain("fraunces");
    expect(fontIdsFor("heading")).toEqual(expect.arrayContaining(["instrument-serif", "fraunces", "source-serif-4"]));
    expect(fontIdsFor("mono")).toEqual(["geist-mono", "jetbrains-mono", "ibm-plex-mono"]);
    for (const role of ["body", "heading"] as const) expect(fontIdsFor(role).some((id) => id.endsWith("-mono"))).toBe(false);
  });

  it("should ship a stylesheet, the preloaded file, and a license for every vendored face", () => {
    for (const font of themeFonts.filter((item) => item.vendored)) {
      const sheet = fontStylesheet(font);
      const preload = fontPreloadHref(font);
      if (!sheet || !preload) throw new Error(`${font.id} has no assets`);
      expect(existsSync(join(publicDir, sheet)), sheet).toBe(true);
      expect(statSync(join(publicDir, preload)).size, preload).toBe(font.bytes);
      expect(readFileSync(join(publicDir, "fonts/v1", font.id, "OFL.txt"), "utf8")).toMatch(/SIL OPEN FONT LICENSE/i);
    }
  });

  it("should load font files only from our own origin when a stylesheet declares a face", () => {
    for (const font of themeFonts.filter((item) => item.vendored)) {
      const sheet = readFileSync(join(publicDir, fontStylesheet(font) ?? ""), "utf8");
      const urls = [...sheet.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1] ?? "");
      expect(urls.length, font.id).toBeGreaterThan(0);
      for (const url of urls) expect(url, font.id).toMatch(/^"[a-z0-9-]+\.woff2"$/);
      expect(sheet).toContain(`font-family: "${font.family}"`);
      expect(sheet).toContain("font-display: swap");
    }
  });
});
