/**
 * Fails when a migration in drizzle/ is destructive or not backward compatible,
 * or when drizzle/*.sql and drizzle/meta/_journal.json disagree.
 *
 * Production applies migrations before the new code goes live, while the old
 * code still serves traffic, so every migration must keep the old code working.
 * A file that is safe anyway can opt out with this first line:
 *   -- migration-guard: allow <reason>
 * Run with: node scripts/check-migrations.mts
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const MIGRATIONS_FOLDER = "drizzle";

const ALLOW_MARKER = /^--\s*migration-guard:\s*allow\s+\S/i;

const IDENT = String.raw`(?:"_"|\w+)`;

const keywordRules: readonly { pattern: RegExp; message: string }[] = [
  { pattern: /\bDROP\s+TABLE\b/i, message: "DROP TABLE deletes data the old code still reads" },
  { pattern: /\bDROP\s+COLUMN\b/i, message: "DROP COLUMN deletes data the old code still reads" },
  { pattern: /\bDROP\s+TYPE\b/i, message: "DROP TYPE breaks columns and code that use the type" },
  { pattern: /\bDROP\s+SCHEMA\b/i, message: "DROP SCHEMA deletes everything in the schema" },
  { pattern: /\bTRUNCATE\b/i, message: "TRUNCATE deletes every row" },
  {
    pattern: new RegExp(String.raw`\bALTER\s+(?:COLUMN\s+)?${IDENT}\s+(?:SET\s+DATA\s+)?TYPE\b`, "i"),
    message: "ALTER COLUMN ... TYPE can break the old code and rewrite the table",
  },
  { pattern: /\bSET\s+NOT\s+NULL\b/i, message: "SET NOT NULL makes the old code's inserts fail" },
  { pattern: /\bRENAME\s+COLUMN\b/i, message: "RENAME COLUMN breaks the old code's queries" },
  {
    pattern: new RegExp(String.raw`\bRENAME\s+(?:${IDENT}\s+)?TO\b`, "i"),
    message: "RENAME ... TO breaks the old code's queries",
  },
];

/**
 * Splits SQL into statements without comments. String literals become `''` and
 * quoted identifiers become `"_"`, so their text never matches a rule.
 * Dollar-quoted bodies stay, because they are code.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let index = 0;
  while (index < sql.length) {
    const rest = sql.slice(index);
    const skipped = skipToken(rest);
    if (skipped) {
      current += skipped.replacement;
      index += skipped.length;
      continue;
    }
    const char = sql.charAt(index);
    index += 1;
    if (char !== ";") {
      current += char;
      continue;
    }
    statements.push(current);
    current = "";
  }
  statements.push(current);
  return statements.map((statement) => statement.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function skipToken(rest: string): { length: number; replacement: string } | null {
  const lineComment = /^--[^\n]*/.exec(rest);
  if (lineComment) return { length: lineComment[0].length, replacement: " " };
  const blockComment = /^\/\*[\s\S]*?\*\//.exec(rest);
  if (blockComment) return { length: blockComment[0].length, replacement: " " };
  const literal = /^'(?:[^']|'')*'/.exec(rest);
  if (literal) return { length: literal[0].length, replacement: "''" };
  const identifier = /^"(?:[^"]|"")*"/.exec(rest);
  if (identifier) return { length: identifier[0].length, replacement: '"_"' };
  const dollar = /^(\$\w*\$)[\s\S]*?\1/.exec(rest);
  if (dollar) return { length: dollar[0].length, replacement: dollar[0] };
  return null;
}

/** Cuts text at its first comma outside parentheses. */
function firstClause(text: string): string {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) return text.slice(0, index);
  }
  return text;
}

function addsRequiredColumnWithoutDefault(statement: string): boolean {
  const clauses = statement.split(/\bADD\s+COLUMN\b/i).slice(1).map(firstClause);
  return clauses.some((clause) => /\bNOT\s+NULL\b/i.test(clause) && !/\bDEFAULT\b/i.test(clause));
}

function statementViolations(statement: string): string[] {
  const found = keywordRules.filter(({ pattern }) => pattern.test(statement)).map(({ message }) => message);
  if (/\bDELETE\s+FROM\b/i.test(statement) && !/\bWHERE\b/i.test(statement)) {
    found.push("DELETE FROM without WHERE deletes every row");
  }
  if (addsRequiredColumnWithoutDefault(statement)) {
    found.push("ADD COLUMN ... NOT NULL without DEFAULT fails on existing rows and the old code's inserts");
  }
  return found;
}

/** True when the file's first line opts it out of the guard with a reason. */
export function hasAllowMarker(sql: string): boolean {
  const firstLine = sql.split("\n", 1)[0] ?? "";
  return ALLOW_MARKER.test(firstLine.trim());
}

/** Lists the destructive or backward-incompatible statements in one migration file. */
export function findViolations(sql: string): string[] {
  if (hasAllowMarker(sql)) return [];
  return [...new Set(splitStatements(sql).flatMap(statementViolations))];
}

/** Lists .sql files without a journal entry, and journal entries without a .sql file. */
export function journalMismatches(sqlTags: readonly string[], journalTags: readonly string[]): string[] {
  const files = new Set(sqlTags);
  const journal = new Set(journalTags);
  return [
    ...sqlTags.filter((tag) => !journal.has(tag)).map((tag) => `${MIGRATIONS_FOLDER}/${tag}.sql has no entry in ${MIGRATIONS_FOLDER}/meta/_journal.json`),
    ...journalTags.filter((tag) => !files.has(tag)).map((tag) => `the journal entry ${tag} has no ${MIGRATIONS_FOLDER}/${tag}.sql`),
  ];
}

const journalSchema = z.object({ entries: z.array(z.object({ tag: z.string() })) });

function readJournalTags(): string[] {
  const raw: unknown = JSON.parse(readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"));
  return journalSchema.parse(raw).entries.map((entry) => entry.tag);
}

function fileProblems(tags: readonly string[]): string[] {
  return tags.flatMap((tag) => findViolations(readFileSync(`${MIGRATIONS_FOLDER}/${tag}.sql`, "utf8")).map((message) => `${MIGRATIONS_FOLDER}/${tag}.sql: ${message}`));
}

function main(): number {
  const sqlTags = readdirSync(MIGRATIONS_FOLDER)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.slice(0, -".sql".length))
    .sort();
  const problems = [...journalMismatches(sqlTags, readJournalTags()), ...fileProblems(sqlTags)];
  if (problems.length === 0) {
    console.log(`All ${String(sqlTags.length)} migrations are additive and in the journal.`);
    return 0;
  }
  console.error("These migrations need attention:");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    "Production applies migrations while the old code still runs, so keep them additive: add a new column or table, backfill, and switch the code over. If a file is safe anyway, start it with: -- migration-guard: allow <reason>",
  );
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
