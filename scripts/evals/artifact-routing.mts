/**
 * Artifact routing eval: how often Claude Code saves everyday "write it up"
 * requests to artifacts.space, and how often it saves near misses that belong
 * in chat or in the repository.
 *
 * Run it on demand, never on a schedule. Every prompt is a real headless
 * Claude Code run (`claude -p`) on YOUR Claude Code login, so one pass of the
 * 30 prompts counts against YOUR plan's usage. Nothing is saved anywhere:
 * the `artifacts` server is a local stub (`artifact-routing-stub.mts`) that
 * serves every tool the real server lists, with the same instructions,
 * descriptions, schemas, and `_meta` (`artifact-routing-tools.json`, which
 * this script refreshes from the code before each pass), and only records
 * the calls.
 *
 *   pnpm eval:routing                          # the MCP server's own words only
 *   pnpm eval:routing --variant default-line   # plus the "make it the default" line in CLAUDE.md
 *   pnpm eval:routing --variant skill --skill ../artifacts-space-skills/skills/artifacts-space/SKILL.md
 *
 * Options: --model <id> (default: Claude Code's default), --concurrency <n>
 * (default 4), --only <id,id>, --max-turns <n> (default 8), --out <dir>
 * (default scripts/evals/results, which git ignores), --no-refresh (serve
 * artifact-routing-tools.json as it is). ARTIFACT_ROUTING_TIMEOUT_MS sets the
 * per-prompt limit (default 240000); CLAUDE_BIN picks the `claude` binary.
 *
 * Each prompt runs in a fresh temporary folder holding a tiny sample project,
 * with only the stub MCP server (`--strict-mcp-config`), no user or project
 * settings (`--setting-sources project,local` in an empty folder), file edits
 * accepted inside that folder only (`--permission-mode acceptEdits`), and no
 * session saved. The folder is removed after each run. Variants:
 * - mcp: no CLAUDE.md files and no skills. Measures the server's words alone.
 * - default-line: the folder's CLAUDE.md holds DEFAULT_INSTRUCTION_LINE from
 *   `src/lib/setup/default-routing.ts`. Your own ~/.claude/CLAUDE.md loads too.
 * - skill: the folder holds the skill at .claude/skills/artifacts-space.
 *   Your own ~/.claude/skills load too.
 *
 * Claude Code turns its built-in Artifact tool off under `claude -p`, so this
 * eval measures whether the agent picks artifacts.space over a local file or
 * a chat answer, not over that tool. Grading is in `artifact-routing-grade.mts`:
 * a prompt counts as routed when an artifacts_create, artifacts_update, or
 * files_create_artifact call happens in a run without errors, and the report
 * also counts the prompts that saved there before writing any local file. A
 * run that errors (the stub never connected, or Claude Code reported an error
 * such as the turn limit or a usage limit) fails and is listed with its
 * reason, never graded as a route. Results go to <out>/<time>-<variant>.json
 * and .md.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { z } from "zod";

import { casesFileSchema, emptyTranscript, gradeCase, parseTranscript, renderMarkdown, runError, summarize, tail, type CaseResult, type RoutingCase } from "./artifact-routing-grade.mts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const stubPath = join(repoRoot, "scripts/evals/artifact-routing-stub.mts");
const casesPath = join(repoRoot, "scripts/evals/artifact-routing-cases.json");
const toolsTestPath = "scripts/evals/artifact-routing-tools.test.ts";

export const variants = ["mcp", "default-line", "skill"] as const;
export type Variant = (typeof variants)[number];

const sampleProject = {
  "package.json": `${JSON.stringify({ name: "acme-billing", private: true, description: "Billing service for Acme: invoices, payments, and webhooks." }, null, 2)}\n`,
  "README.md": "# acme-billing\n\nThe billing service. It sends invoices and will recieve payment webhooks.\n",
  "src/math.ts": "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
};

const defaultRoutingSchema = z.object({ DEFAULT_INSTRUCTION_LINE: z.string().min(1) });

/** Loads the documented line from the working tree. The path is computed at run time because Node runs this file without the app's `@/` alias. */
async function loadDefaultLine(): Promise<string> {
  const loaded: unknown = await import(pathToFileURL(join(repoRoot, "src/lib/setup/default-routing.ts")).href);
  return defaultRoutingSchema.parse(loaded).DEFAULT_INSTRUCTION_LINE;
}

interface Options {
  variant: Variant;
  model: string;
  concurrency: number;
  only: Set<string>;
  maxTurns: number;
  outDir: string;
  skillPath: string;
  defaultLine: string;
  refresh: boolean;
}

/** Writes the sample project, the variant's extras, and the stub's MCP config into a fresh folder. */
function prepareWorkspace(options: Options) {
  const dir = mkdtempSync(join(tmpdir(), "artifact-routing-"));
  activeWorkspaces.add(dir);
  for (const [path, content] of Object.entries(sampleProject)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  if (options.variant === "default-line") writeFileSync(join(dir, "CLAUDE.md"), `${options.defaultLine}\n`);
  if (options.variant === "skill") {
    mkdirSync(join(dir, ".claude/skills/artifacts-space"), { recursive: true });
    copyFileSync(options.skillPath, join(dir, ".claude/skills/artifacts-space/SKILL.md"));
  }
  const logPath = join(dir, ".stub-calls.jsonl");
  const server = { command: process.execPath, args: ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", stubPath], env: { ARTIFACT_ROUTING_LOG: logPath } };
  const configPath = join(dir, ".mcp-eval.json");
  writeFileSync(configPath, JSON.stringify({ mcpServers: { artifacts: server } }));
  return { dir, configPath, logPath };
}

const stubLogLineSchema = z.object({ tool: z.string() });

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/** The calls the stub recorded, as `mcp__artifacts__<tool>`. A missing log means no calls. */
export function readStubCalls(logPath: string): string[] {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split("\n")
    .flatMap((line) => {
      if (!line.trim()) return [];
      const parsed = stubLogLineSchema.safeParse(parseJson(line));
      return parsed.success ? [`mcp__artifacts__${parsed.data.tool}`] : [];
    });
}

/** The `claude` arguments for one prompt. */
export function claudeArgs(prompt: string, configPath: string, options: Pick<Options, "variant" | "model" | "maxTurns">): string[] {
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--mcp-config", configPath];
  // acceptEdits lets file edits inside the throwaway workspace go through, as a person approving them would, so a
  // near miss such as fixing a README can end in a real edit instead of a denial that pushes the agent elsewhere.
  args.push("--allowedTools", "mcp__artifacts", "--permission-mode", "acceptEdits", "--setting-sources", "project,local");
  args.push("--max-turns", String(options.maxTurns), "--no-session-persistence");
  if (options.variant !== "skill") args.push("--disable-slash-commands");
  if (options.model) args.push("--model", options.model);
  return args;
}

function claudeEnv(variant: Variant): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_ARTIFACT_AUTO_OPEN: "0" };
  if (variant !== "default-line") env.CLAUDE_CODE_DISABLE_CLAUDE_MDS = "1";
  return env;
}

/** Per-prompt limit. ARTIFACT_ROUTING_TIMEOUT_MS overrides it, for slow machines or to test the timeout. */
const RUN_TIMEOUT_MS = Number.parseInt(process.env.ARTIFACT_ROUTING_TIMEOUT_MS ?? "", 10) || 240_000;
const KILL_GRACE_MS = 5_000;

/** Runs that are still going, so Ctrl+C can stop them and the stubs they started. */
const activeRuns = new Set<ChildProcess>();
/** Workspaces not yet removed, so Ctrl+C can remove them too. */
const activeWorkspaces = new Set<string>();

/** Signals the run's whole process group: `claude` and the stub server it started. */
function signalGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // The group is already gone.
  }
}

/**
 * Runs `claude` once in its own process group and resolves with its output
 * once it has exited. On the timeout it sends SIGTERM to the group, then
 * SIGKILL after a grace period, waits for the exit, and rejects with the tail
 * of what the run printed.
 */
function runClaude(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.env.CLAUDE_BIN ?? "claude", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    activeRuns.add(child);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      signalGroup(child, "SIGTERM");
      killTimer = setTimeout(() => { signalGroup(child, "SIGKILL"); }, KILL_GRACE_MS);
    }, RUN_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const finish = (error: Error | null) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      activeRuns.delete(child);
      if (error) reject(error);
      else resolvePromise({ stdout, stderr });
    };
    child.on("error", finish);
    child.on("close", () => {
      if (!timedOut) {
        finish(null);
        return;
      }
      finish(new Error(`timed out after ${RUN_TIMEOUT_MS / 1000}s. stdout: ${tail(stdout) || "(none)"} stderr: ${tail(stderr) || "(none)"}`));
    });
  });
}

async function runCase(testCase: RoutingCase, options: Options): Promise<CaseResult> {
  const { dir, configPath, logPath } = prepareWorkspace(options);
  try {
    const { stdout, stderr } = await runClaude(claudeArgs(testCase.prompt, configPath, options), dir, claudeEnv(options.variant));
    const transcript = parseTranscript(stdout);
    return gradeCase(testCase, transcript, { error: runError(transcript, stderr), stubCalls: readStubCalls(logPath) });
  } catch (error) {
    return gradeCase(testCase, emptyTranscript(), { error: error instanceof Error ? error.message : "run failed", stubCalls: readStubCalls(logPath) });
  } finally {
    // runClaude settles only after the run has exited, so nothing still writes here.
    rmSync(dir, { recursive: true, force: true });
    activeWorkspaces.delete(dir);
  }
}

/** Runs the cases with at most `concurrency` runs at once, keeping their order. */
async function runAll(cases: RoutingCase[], options: Options): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  let next = 0;
  async function worker() {
    for (let index = next++; index < cases.length; index = next++) {
      const testCase = cases[index];
      if (!testCase) return;
      const result = await runCase(testCase, options);
      results[index] = result;
      console.log(`${result.passed ? "pass" : "FAIL"}  ${result.id.padEnd(18)} ${result.route}${result.error ? ` (${result.error})` : ""}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.concurrency, cases.length) }, worker));
  return results;
}

/** Rebuilds artifact-routing-tools.json from the code, so the stub serves what the working tree would ship. */
function refreshToolsSnapshot() {
  const result = spawnSync("pnpm", ["exec", "vitest", "run", toolsTestPath, "--update"], { cwd: repoRoot, encoding: "utf8" });
  if (result.error) throw new Error(`Could not run pnpm to refresh artifact-routing-tools.json: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Could not refresh artifact-routing-tools.json: ${tail(`${result.stdout}${result.stderr}`, 600)}`);
}

function variantOf(value: string): Variant {
  const found = variants.find((variant) => variant === value);
  if (!found) throw new Error(`--variant must be one of: ${variants.join(", ")}`);
  return found;
}

async function readOptions(): Promise<Options> {
  const { values } = parseArgs({
    options: {
      variant: { type: "string", default: "mcp" },
      model: { type: "string", default: "" },
      concurrency: { type: "string", default: "4" },
      only: { type: "string", default: "" },
      "max-turns": { type: "string", default: "8" },
      out: { type: "string", default: join(repoRoot, "scripts/evals/results") },
      skill: { type: "string", default: "" },
      "no-refresh": { type: "boolean", default: false },
    },
  });
  const variant = variantOf(values.variant);
  const skillPath = values.skill ? resolve(values.skill) : "";
  if (variant === "skill" && !existsSync(skillPath)) throw new Error("--variant skill needs --skill <path to SKILL.md>.");
  return {
    variant,
    model: values.model,
    concurrency: Math.max(1, Number.parseInt(values.concurrency, 10) || 4),
    only: new Set(values.only.split(",").filter(Boolean)),
    maxTurns: Math.max(1, Number.parseInt(values["max-turns"], 10) || 8),
    outDir: resolve(values.out),
    skillPath,
    defaultLine: variant === "default-line" ? await loadDefaultLine() : "",
    refresh: !values["no-refresh"],
  };
}

/** Stops every running `claude` and its stub on Ctrl+C or SIGTERM and removes their workspaces, so nothing outlives the eval. */
function stopRunsOnInterrupt() {
  const stop = (code: number) => () => {
    for (const child of activeRuns) signalGroup(child, "SIGKILL");
    for (const dir of activeWorkspaces) rmSync(dir, { recursive: true, force: true });
    process.exit(code);
  };
  process.once("SIGINT", stop(130));
  process.once("SIGTERM", stop(143));
}

/** The cases `--only` names. Throws on an id that does not exist, so a typo never runs an empty pass. */
export function selectCases(cases: RoutingCase[], only: ReadonlySet<string>): RoutingCase[] {
  if (only.size === 0) return cases;
  const known = new Set(cases.map((testCase) => testCase.id));
  const unknown = [...only].filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`--only names unknown ids: ${unknown.join(", ")}. Ids are in scripts/evals/artifact-routing-cases.json.`);
  return cases.filter((testCase) => only.has(testCase.id));
}

async function main() {
  const options = await readOptions();
  if (options.refresh) refreshToolsSnapshot();
  const { cases } = casesFileSchema.parse(JSON.parse(readFileSync(casesPath, "utf8")));
  const selected = selectCases(cases, options.only);
  const startedAt = new Date().toISOString();
  stopRunsOnInterrupt();
  console.log(`Running ${selected.length} prompts, variant ${options.variant}. Each is a real Claude Code run on your login.`);
  const results = await runAll(selected, options);
  const summary = summarize(results);
  const meta = { variant: options.variant, model: options.model || (results.find((result) => result.model)?.model ?? ""), startedAt };
  mkdirSync(options.outDir, { recursive: true });
  const base = join(options.outDir, `${startedAt.replace(/[:.]/g, "-")}-${options.variant}`);
  writeFileSync(`${base}.json`, `${JSON.stringify({ ...meta, summary, results }, null, 2)}\n`);
  writeFileSync(`${base}.md`, renderMarkdown(summary, meta));
  console.log(`\nSaved to artifacts.space ${summary.routed}/${summary.shouldRoute} (${summary.routedPercent}%), before any local file ${summary.routedFirst}/${summary.shouldRoute}.`);
  console.log(`Near-miss false positives ${summary.falsePositives}/${summary.nearMisses}. Errors ${summary.errors}. About $${summary.costUsd.toFixed(2)}.`);
  console.log(`Report: ${base}.md`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
