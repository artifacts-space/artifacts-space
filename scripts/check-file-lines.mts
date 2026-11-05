/**
 * Fails when any tracked text file is longer than MAX_LINES.
 * ESLint enforces the same limit on source files; this covers everything else
 * (CSS, Markdown, JSON, SQL, config). Run with: node scripts/check-file-lines.mts
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const MAX_LINES = 500;

/** Files allowed to exceed the limit by decision. */
const exemptFiles = new Set(["AGENTS.md", "CLAUDE.md", "src/app/globals.css"]);

/** Generated files nobody edits by hand. */
const generatedPatterns = [/^pnpm-lock\.yaml$/, /^drizzle\/meta\//];

const binaryExtensions = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|pdf|zip)$/i;

function listFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return output.split("\n").filter(Boolean);
}

function isChecked(file: string): boolean {
  // Tracked files deleted in the working tree have nothing to count.
  if (!existsSync(file)) return false;
  if (exemptFiles.has(file)) return false;
  if (binaryExtensions.test(file)) return false;
  return !generatedPatterns.some((pattern) => pattern.test(file));
}

function countLines(file: string): number {
  const text = readFileSync(file, "utf8");
  if (text.length === 0) return 0;
  const lines = text.split("\n").length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

const tooLong = listFiles()
  .filter(isChecked)
  .map((file) => ({ file, lines: countLines(file) }))
  .filter(({ lines }) => lines > MAX_LINES);

if (tooLong.length > 0) {
  console.error(`These files are over ${String(MAX_LINES)} lines:`);
  for (const { file, lines } of tooLong) console.error(`  ${file}: ${String(lines)}`);
  process.exit(1);
}

console.log(`All files are within ${String(MAX_LINES)} lines.`);
