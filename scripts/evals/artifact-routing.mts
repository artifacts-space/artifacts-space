/**
 * Artifact routing eval: how often Claude Code saves everyday "write it up"
 * requests to artifacts.space, and how often it saves near misses that belong
 * in chat or in the repository.
 *
 * Run it on demand, never on a schedule. Every prompt is a real headless
 * Claude Code run (`claude -p`) on YOUR Claude Code login, so one pass of the
 * 30 prompts counts against YOUR plan's usage. Nothing is saved anywhere:
 * the `artifacts` server is a local stub (`artifact-routing-stub.mts`) that
 * serves the real server instructions and tool descriptions from
 * `src/lib/mcp/routing-copy.ts` and only records the calls.
 *
 *   pnpm eval:routing                          # the MCP server's own words only
 *   pnpm eval:routing --variant default-line   # plus the "make it the default" line in CLAUDE.md
 *   pnpm eval:routing --variant skill --skill ../artifacts-space-skills/skills/artifacts-space/SKILL.md
 *
 * Options: --model <id> (default: Claude Code's default), --concurrency <n>
 * (default 4), --only <id,id>, --max-turns <n> (default 8), --out <dir>
 * (default scripts/evals/results, which git ignores).
 *
 * Each prompt runs in a fresh temporary folder holding a tiny sample project,
 * with only the stub MCP server (`--strict-mcp-config`), no user or project
 * settings (`--setting-sources project,local` in an empty folder), and no
 * session saved. Variants:
 * - mcp: no CLAUDE.md files and no skills. Measures the server's words alone.
 * - default-line: the folder's CLAUDE.md holds DEFAULT_INSTRUCTION_LINE from
 *   `src/lib/setup/default-routing.ts`. Your own ~/.claude/CLAUDE.md loads too.
 * - skill: the folder holds the skill at .claude/skills/artifacts-space.
 *   Your own ~/.claude/skills load too.
 *
 * Claude Code turns its built-in Artifact tool off under `claude -p`, so this
 * eval measures whether the agent picks artifacts.space over a local file or
 * a chat answer, not over that tool. A prompt counts as routed when any
 * artifacts_create or artifacts_update call happens; a near miss counts as a
 * false positive on the same rule. Results go to <out>/<time>-<variant>.json
 * and .md.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { z } from "zod";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const stubPath = join(repoRoot, "scripts/evals/artifact-routing-stub.mts");
const casesPath = join(repoRoot, "scripts/evals/artifact-routing-cases.json");

export const variants = ["mcp", "default-line", "skill"] as const;
export type Variant = (typeof variants)[number];

export const caseSchema = z.object({ id: z.string().min(1), expect: z.enum(["artifacts", "elsewhere"]), prompt: z.string().min(1) });
export type RoutingCase = z.infer<typeof caseSchema>;
export const casesFileSchema = z.object({ about: z.string(), cases: z.array(caseSchema).min(1) });

/** Calls that save to artifacts.space. */
const ARTIFACT_SAVE_TOOLS = new Set(["mcp__artifacts__artifacts_create", "mcp__artifacts__artifacts_update", "mcp__artifacts__files_create_artifact"]);
/** Calls that put the work in a local file instead. */
const FILE_WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

/** Where the work went first: artifacts.space, Claude Code's own Artifact tool, a local file, or only the chat. */
export type Route = "artifacts" | "builtin-artifact" | "file" | "chat";

/** One tool call from the transcript. */
export interface ToolCall {
  name: string;
  input: unknown;
}

/** What one `claude -p` run did, read from its stream-json output. */
export interface Transcript {
  calls: ToolCall[];
  costUsd: number;
  turns: number;
  isError: boolean;
  model: string;
  artifactsServer: string;
}

const toolUseSchema = z.object({ type: z.literal("tool_use"), name: z.string(), input: z.unknown() });
const assistantEventSchema = z.object({ type: z.literal("assistant"), message: z.object({ content: z.array(z.unknown()) }) });
const resultEventSchema = z.object({ type: z.literal("result"), total_cost_usd: z.number().optional(), num_turns: z.number().optional(), is_error: z.boolean().optional() });
const initEventSchema = z.object({
  type: z.literal("system"),
  subtype: z.literal("init"),
  model: z.string().optional(),
  mcp_servers: z.array(z.object({ name: z.string(), status: z.string() })).optional(),
});

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/** Takes the model and the stub's connection status from the init event. Returns false for other events. */
function applyInit(transcript: Transcript, event: unknown): boolean {
  const init = initEventSchema.safeParse(event);
  if (!init.success) return false;
  transcript.model = init.data.model ?? "";
  transcript.artifactsServer = init.data.mcp_servers?.find((server) => server.name === "artifacts")?.status ?? "missing";
  return true;
}

/** Collects the tool calls of an assistant message. Returns false for other events. */
function applyAssistant(transcript: Transcript, event: unknown): boolean {
  const assistant = assistantEventSchema.safeParse(event);
  if (!assistant.success) return false;
  for (const block of assistant.data.message.content) {
    const call = toolUseSchema.safeParse(block);
    if (call.success) transcript.calls.push({ name: call.data.name, input: call.data.input });
  }
  return true;
}

/** Applies one stream-json event to the transcript. */
function applyEvent(transcript: Transcript, event: unknown) {
  if (applyInit(transcript, event) || applyAssistant(transcript, event)) return;
  const result = resultEventSchema.safeParse(event);
  if (!result.success) return;
  transcript.costUsd = result.data.total_cost_usd ?? 0;
  transcript.turns = result.data.num_turns ?? 0;
  transcript.isError = result.data.is_error ?? false;
}

/** Reads `claude -p --output-format stream-json --verbose` output. Lines that are not JSON are skipped. */
export function parseTranscript(output: string): Transcript {
  const transcript: Transcript = { calls: [], costUsd: 0, turns: 0, isError: false, model: "", artifactsServer: "missing" };
  for (const line of output.split("\n")) {
    if (line.trim()) applyEvent(transcript, parseLine(line));
  }
  return transcript;
}

/** Where the work went first, by the first call that saves or writes it. */
export function firstRoute(calls: readonly ToolCall[]): Route {
  for (const { name } of calls) {
    if (ARTIFACT_SAVE_TOOLS.has(name)) return "artifacts";
    if (name === "Artifact") return "builtin-artifact";
    if (FILE_WRITE_TOOLS.has(name)) return "file";
  }
  return "chat";
}

/** Whether the run saved anything to artifacts.space. */
export function savedToArtifacts(calls: readonly ToolCall[]): boolean {
  return calls.some((call) => ARTIFACT_SAVE_TOOLS.has(call.name));
}

const searchInputSchema = z.object({ query: z.string() });

/** The queries the agent sent to Claude Code's tool search, to explain a miss. */
export function toolSearches(calls: readonly ToolCall[]): string[] {
  return calls.flatMap((call) => {
    if (call.name !== "ToolSearch") return [];
    const input = searchInputSchema.safeParse(call.input);
    return input.success ? [input.data.query] : [];
  });
}

/** One graded prompt. */
export interface CaseResult {
  id: string;
  expect: RoutingCase["expect"];
  prompt: string;
  saved: boolean;
  route: Route;
  passed: boolean;
  searches: string[];
  tools: string[];
  costUsd: number;
  model: string;
  error: string;
}

/** Grades one run: a prompt that expects artifacts passes when it saved; a near miss passes when it did not. */
export function gradeCase(testCase: RoutingCase, transcript: Transcript, error = ""): CaseResult {
  const saved = savedToArtifacts(transcript.calls);
  return {
    id: testCase.id,
    expect: testCase.expect,
    prompt: testCase.prompt,
    saved,
    route: firstRoute(transcript.calls),
    passed: !error && (testCase.expect === "artifacts" ? saved : !saved),
    searches: toolSearches(transcript.calls),
    tools: transcript.calls.map((call) => call.name),
    costUsd: transcript.costUsd,
    model: transcript.model,
    error,
  };
}

/** The headline numbers for a pass. */
export interface RoutingSummary {
  shouldRoute: number;
  routed: number;
  routedPercent: number;
  nearMisses: number;
  falsePositives: number;
  errors: number;
  costUsd: number;
  misroutes: CaseResult[];
  falsePositiveCases: CaseResult[];
}

function percent(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

/** Counts routed prompts, misroutes, and near-miss false positives. */
export function summarize(results: readonly CaseResult[]): RoutingSummary {
  const should = results.filter((result) => result.expect === "artifacts");
  const near = results.filter((result) => result.expect === "elsewhere");
  const routed = should.filter((result) => result.saved).length;
  const falsePositiveCases = near.filter((result) => result.saved);
  return {
    shouldRoute: should.length,
    routed,
    routedPercent: percent(routed, should.length),
    nearMisses: near.length,
    falsePositives: falsePositiveCases.length,
    errors: results.filter((result) => result.error).length,
    costUsd: Math.round(results.reduce((sum, result) => sum + result.costUsd, 0) * 100) / 100,
    misroutes: should.filter((result) => !result.saved),
    falsePositiveCases,
  };
}

function caseLine(result: CaseResult) {
  const searches = result.searches.length > 0 ? ` Searched: ${result.searches.map((query) => `\`${query}\``).join(", ")}.` : " No tool search.";
  const error = result.error ? ` Error: ${result.error}.` : "";
  return `- \`${result.id}\` went to **${result.route}**.${searches}${error}`;
}

/** The Markdown report for one pass. */
export function renderMarkdown(summary: RoutingSummary, meta: { variant: Variant; model: string; startedAt: string }): string {
  const lines = [
    `# Artifact routing eval: ${meta.variant}`,
    "",
    `Run ${meta.startedAt} on ${meta.model || "the default model"}.`,
    "",
    "| Measure | Result |",
    "| --- | --- |",
    `| Routed to artifacts.space | ${summary.routed} of ${summary.shouldRoute} (${summary.routedPercent}%) |`,
    `| Near-miss false positives | ${summary.falsePositives} of ${summary.nearMisses} |`,
    `| Runs with errors | ${summary.errors} |`,
    `| Estimated cost | $${summary.costUsd.toFixed(2)} |`,
    "",
    "## Misroutes",
    "",
    ...(summary.misroutes.length > 0 ? summary.misroutes.map(caseLine) : ["None."]),
    "",
    "## Near-miss false positives",
    "",
    ...(summary.falsePositiveCases.length > 0 ? summary.falsePositiveCases.map(caseLine) : ["None."]),
    "",
  ];
  return lines.join("\n");
}

const sampleProject = {
  "package.json": `${JSON.stringify({ name: "acme-billing", private: true, description: "Billing service for Acme: invoices, payments, and webhooks." }, null, 2)}\n`,
  "README.md": "# acme-billing\n\nThe billing service. It sends invoices and will recieve payment webhooks.\n",
  "src/math.ts": "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
};

const defaultRoutingSchema = z.object({ DEFAULT_INSTRUCTION_LINE: z.string().min(1) });

/** Loads the documented line from the working tree, as the stub loads the server's words. */
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
}

/** Writes the sample project, the variant's extras, and the stub's MCP config into a fresh folder. */
function prepareWorkspace(options: Options) {
  const dir = mkdtempSync(join(tmpdir(), "artifact-routing-"));
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
  return { dir, configPath };
}

/** The `claude` arguments for one prompt. */
export function claudeArgs(prompt: string, configPath: string, options: Pick<Options, "variant" | "model" | "maxTurns">): string[] {
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--mcp-config", configPath];
  args.push("--allowedTools", "mcp__artifacts", "--setting-sources", "project,local", "--max-turns", String(options.maxTurns), "--no-session-persistence");
  if (options.variant !== "skill") args.push("--disable-slash-commands");
  if (options.model) args.push("--model", options.model);
  return args;
}

function claudeEnv(variant: Variant): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_ARTIFACT_AUTO_OPEN: "0" };
  if (variant !== "default-line") env.CLAUDE_CODE_DISABLE_CLAUDE_MDS = "1";
  return env;
}

const RUN_TIMEOUT_MS = 240_000;

/** Runs `claude` once and resolves with its output. Rejects on a spawn failure or the timeout. */
function runClaude(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.env.CLAUDE_BIN ?? "claude", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`timed out after ${RUN_TIMEOUT_MS / 1000}s`));
    }, RUN_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolvePromise({ stdout, stderr });
    });
  });
}

async function runCase(testCase: RoutingCase, options: Options): Promise<CaseResult> {
  const { dir, configPath } = prepareWorkspace(options);
  try {
    const { stdout, stderr } = await runClaude(claudeArgs(testCase.prompt, configPath, options), dir, claudeEnv(options.variant));
    const transcript = parseTranscript(stdout);
    const error = transcript.artifactsServer === "connected" ? "" : `artifacts stub ${transcript.artifactsServer}${stderr ? `: ${stderr.trim().slice(0, 200)}` : ""}`;
    return gradeCase(testCase, transcript, error);
  } catch (error) {
    return gradeCase(testCase, parseTranscript(""), error instanceof Error ? error.message : "run failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
  };
}

async function main() {
  const options = await readOptions();
  const { cases } = casesFileSchema.parse(JSON.parse(readFileSync(casesPath, "utf8")));
  const selected = options.only.size > 0 ? cases.filter((testCase) => options.only.has(testCase.id)) : cases;
  const startedAt = new Date().toISOString();
  console.log(`Running ${selected.length} prompts, variant ${options.variant}. Each is a real Claude Code run on your login.`);
  const results = await runAll(selected, options);
  const summary = summarize(results);
  const meta = { variant: options.variant, model: options.model || (results.find((result) => result.model)?.model ?? ""), startedAt };
  mkdirSync(options.outDir, { recursive: true });
  const base = join(options.outDir, `${startedAt.replace(/[:.]/g, "-")}-${options.variant}`);
  writeFileSync(`${base}.json`, `${JSON.stringify({ ...meta, summary, results }, null, 2)}\n`);
  writeFileSync(`${base}.md`, renderMarkdown(summary, meta));
  console.log(`\nRouted ${summary.routed}/${summary.shouldRoute} (${summary.routedPercent}%). Near-miss false positives ${summary.falsePositives}/${summary.nearMisses}. Errors ${summary.errors}. About $${summary.costUsd.toFixed(2)}.`);
  console.log(`Report: ${base}.md`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
