import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EMOJI_LOCALE, EMOJIBASE_URL } from "./emoji-data";

const site = "https://artifacts.space";
const publicDir = join(process.cwd(), "public");

describe("emoji picker data", () => {
  it("should load from the site's own origin when the picker opens", () => {
    expect(EMOJIBASE_URL).toMatch(/^\/[^/]/);
    expect(new URL(`${EMOJIBASE_URL}/${EMOJI_LOCALE}/data.json`, site).origin).toBe(site);
    expect(new URL(`${EMOJIBASE_URL}/${EMOJI_LOCALE}/messages.json`, site).origin).toBe(site);
  });

  it("should ship the files frimousse fetches and the license when the data is vendored", () => {
    for (const file of [`${EMOJI_LOCALE}/data.json`, `${EMOJI_LOCALE}/messages.json`, "LICENSE"]) {
      expect(existsSync(join(publicDir, EMOJIBASE_URL, file))).toBe(true);
    }
    expect(readFileSync(join(publicDir, EMOJIBASE_URL, "LICENSE"), "utf8")).toMatch(/^MIT License/);
  });

  it("should pass the same-origin URL to frimousse and name no outside host when the picker renders", () => {
    const source = readFileSync(join(process.cwd(), "src/components/artifact-icon/emoji-tab.tsx"), "utf8");
    expect(source).toContain("emojibaseUrl={EMOJIBASE_URL}");
    expect(source).toContain("locale={EMOJI_LOCALE}");
    expect(source).not.toMatch(/https?:\/\//);
  });
});
