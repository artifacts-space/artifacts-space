import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { envDocs } from "./env-docs";

/** Set on the command line for one run. A line in an env file would leave a safety check switched off. */
const setForOneCommand = new Set(["ALLOW_SHARED_MIGRATE", "E2E_LOCAL_DB"]);

/** Marked required in the docs' list, but the app starts without it: only the scheduled jobs of a deployment read it. */
const neededOnlyWhenDeployed = new Set(["CRON_SECRET"]);

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

  it("should have a line in .env.example for every variable a person sets", () => {
    const example = readFileSync(".env.example", "utf8");
    const listed = new Set([...example.matchAll(/^(?:# )?([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]));
    const setByPerson = envDocs.filter((doc) => doc.need !== "platform" && !setForOneCommand.has(doc.name)).map((doc) => doc.name);
    expect(setByPerson.filter((name) => !listed.has(name)).sort()).toEqual([]);
    for (const name of setForOneCommand) expect(listed.has(name), name).toBe(false);
  });

  it("should send README readers to the full list instead of copying it", () => {
    const readme = readFileSync("README.md", "utf8");
    const start = readme.indexOf("### Environment variables");
    const section = readme.slice(start, readme.indexOf("\n### ", start + 1));
    expect(start).toBeGreaterThan(-1);
    expect(section).toContain("https://artifacts.space/docs/self-hosting#env");
    const inTable = [...section.matchAll(/^\| `([A-Z][A-Z0-9_]+)`/gm)].map((match) => match[1]);
    const neededToStart = envDocs.filter((doc) => doc.need === "required" && !neededOnlyWhenDeployed.has(doc.name)).map((doc) => doc.name);
    expect(inTable).toEqual(neededToStart);
  });

  it("should name in the README's deploy steps what a deployment needs beyond the three", () => {
    const readme = readFileSync("README.md", "utf8");
    const start = readme.indexOf("### Deploy on Vercel");
    const section = readme.slice(start, readme.indexOf("\n## ", start + 1));
    for (const name of [...neededOnlyWhenDeployed, "SENDIR_API_KEY", "SENDIR_IDENTITY_ID", "R2_*"]) expect(section, name).toContain(`\`${name}\``);
  });

  it("should list each variable once when the table is built", () => {
    expect(new Set(envDocs.map((doc) => doc.name)).size).toBe(envDocs.length);
  });
});
