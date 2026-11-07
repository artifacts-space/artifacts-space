import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { envDocs } from "./env-docs";

const envRead = /\benv\.([A-Z][A-Z0-9_]+)\b/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("envDocs", () => {
  it("should document every environment variable when the app reads it", () => {
    const read = new Set<string>();
    for (const file of [...sourceFiles("src"), "drizzle.config.ts", "next.config.ts"]) {
      for (const match of readFileSync(file, "utf8").matchAll(envRead)) if (match[1]) read.add(match[1]);
    }
    const documented = new Set(envDocs.map((doc) => doc.name));
    expect([...read].filter((name) => !documented.has(name)).sort()).toEqual([]);
  });

  it("should list each variable once when the table is built", () => {
    expect(new Set(envDocs.map((doc) => doc.name)).size).toBe(envDocs.length);
  });
});
