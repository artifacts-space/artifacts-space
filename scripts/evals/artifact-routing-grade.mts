/**
 * Grading for the artifact routing eval (`artifact-routing.mts`): reads a
 * `claude -p --output-format stream-json --verbose` transcript, decides where
 * the work went, and builds the summary and the Markdown report. Pure
 * functions only, so `artifact-routing.test.ts` covers them without running
 * Claude Code.
 */
import { z } from "zod";

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
  /** The result event's subtype, such as "success" or "error_max_turns". */
  resultSubtype: string;
  /** The result event's final text, which explains an error. */
  resultText: string;
  model: string;
  artifactsServer: string;
}

const toolUseSchema = z.object({ type: z.literal("tool_use"), name: z.string(), input: z.unknown() });
const assistantEventSchema = z.object({ type: z.literal("assistant"), message: z.object({ content: z.array(z.unknown()) }) });
const resultEventSchema = z.object({
  type: z.literal("result"),
  subtype: z.string().optional(),
  result: z.string().optional(),
  total_cost_usd: z.number().optional(),
  num_turns: z.number().optional(),
  is_error: z.boolean().optional(),
});
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

/** Takes the cost, turns, and outcome from the final result event. */
function applyResult(transcript: Transcript, event: unknown) {
  const result = resultEventSchema.safeParse(event);
  if (!result.success) return;
  transcript.costUsd = result.data.total_cost_usd ?? 0;
  transcript.turns = result.data.num_turns ?? 0;
  transcript.isError = result.data.is_error ?? false;
  transcript.resultSubtype = result.data.subtype ?? "";
  transcript.resultText = result.data.result ?? "";
}

/** An empty transcript, for a run that produced no output. */
export function emptyTranscript(): Transcript {
  return { calls: [], costUsd: 0, turns: 0, isError: false, resultSubtype: "", resultText: "", model: "", artifactsServer: "missing" };
}

/** Reads `claude -p --output-format stream-json --verbose` output. Lines that are not JSON are skipped. */
export function parseTranscript(output: string): Transcript {
  const transcript = emptyTranscript();
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const event = parseLine(line);
    if (!applyInit(transcript, event) && !applyAssistant(transcript, event)) applyResult(transcript, event);
  }
  return transcript;
}

/** The last `chars` characters of `text`, on one line, for an error message. */
export function tail(text: string, chars = 300): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > chars ? `…${flat.slice(-chars)}` : flat;
}

/**
 * Why a run cannot be graded as a routing choice, or "" when it can: the stub
 * never connected, or Claude Code ended the run with an error (an expired
 * login, a usage limit, the turn limit, an API failure).
 */
export function runError(transcript: Transcript, stderr = ""): string {
  if (transcript.artifactsServer !== "connected") return `artifacts stub ${transcript.artifactsServer}${stderr ? `: ${tail(stderr, 200)}` : ""}`;
  if (!transcript.isError) return "";
  const reason = transcript.resultText || stderr;
  return `claude ended with an error (${transcript.resultSubtype || "unknown"})${reason ? `: ${tail(reason, 200)}` : ""}`;
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

/** Whether any of these tool names saves to artifacts.space. */
export function savesToArtifacts(names: readonly string[]): boolean {
  return names.some((name) => ARTIFACT_SAVE_TOOLS.has(name));
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
  /** The calls the stub recorded, as `mcp__artifacts__<tool>`. */
  stubCalls: string[];
  costUsd: number;
  model: string;
  error: string;
}

/**
 * Grades one run. A run with an error fails and counts only as an error. Otherwise
 * a prompt that expects artifacts passes when it saved, and a near miss passes
 * when it did not. A save counts when the transcript or the stub's log shows it.
 */
export function gradeCase(testCase: RoutingCase, transcript: Transcript, run: { error?: string; stubCalls?: string[] } = {}): CaseResult {
  const error = run.error ?? "";
  const stubCalls = run.stubCalls ?? [];
  const tools = transcript.calls.map((call) => call.name);
  const saved = savesToArtifacts(tools) || savesToArtifacts(stubCalls);
  return {
    id: testCase.id,
    expect: testCase.expect,
    prompt: testCase.prompt,
    saved,
    route: firstRoute(transcript.calls),
    passed: !error && (testCase.expect === "artifacts" ? saved : !saved),
    searches: toolSearches(transcript.calls),
    tools,
    stubCalls,
    costUsd: transcript.costUsd,
    model: transcript.model,
    error,
  };
}

/** The headline numbers for a pass. Runs with errors are left out of every count but `errors`. */
export interface RoutingSummary {
  /** Prompts that should save, among runs without errors. */
  shouldRoute: number;
  /** Saved to artifacts.space at all. */
  routed: number;
  routedPercent: number;
  /** Saved to artifacts.space before writing any local file. */
  routedFirst: number;
  routedFirstPercent: number;
  /** Near misses among runs without errors. */
  nearMisses: number;
  falsePositives: number;
  errors: number;
  costUsd: number;
  misroutes: CaseResult[];
  /** Saved, but the first save or write went elsewhere (a local file, or only the stub's log showed the save). */
  elsewhereFirstCases: CaseResult[];
  falsePositiveCases: CaseResult[];
  errorCases: CaseResult[];
}

function percent(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

/**
 * Counts routed prompts, prompts routed first, misroutes, and near-miss false
 * positives over the runs without errors, and lists the errored runs apart.
 */
export function summarize(results: readonly CaseResult[]): RoutingSummary {
  const clean = results.filter((result) => !result.error);
  const should = clean.filter((result) => result.expect === "artifacts");
  const near = clean.filter((result) => result.expect === "elsewhere");
  const routed = should.filter((result) => result.saved);
  const routedFirst = routed.filter((result) => result.route === "artifacts");
  const falsePositiveCases = near.filter((result) => result.saved);
  return {
    shouldRoute: should.length,
    routed: routed.length,
    routedPercent: percent(routed.length, should.length),
    routedFirst: routedFirst.length,
    routedFirstPercent: percent(routedFirst.length, should.length),
    nearMisses: near.length,
    falsePositives: falsePositiveCases.length,
    errors: results.length - clean.length,
    costUsd: Math.round(results.reduce((sum, result) => sum + result.costUsd, 0) * 100) / 100,
    misroutes: should.filter((result) => !result.saved),
    elsewhereFirstCases: routed.filter((result) => result.route !== "artifacts"),
    falsePositiveCases,
    errorCases: results.filter((result) => result.error),
  };
}

function caseLine(result: CaseResult) {
  const searches = result.searches.length > 0 ? ` Searched: ${result.searches.map((query) => `\`${query}\``).join(", ")}.` : " No tool search.";
  const error = result.error ? ` Error: ${result.error}.` : "";
  return `- \`${result.id}\` went to **${result.route}** first.${searches}${error}`;
}

function section(title: string, cases: readonly CaseResult[]) {
  return [`## ${title}`, "", ...(cases.length > 0 ? cases.map(caseLine) : ["None."]), ""];
}

/** What each variant loads from the operator's own setup, which can move its numbers. */
const variantCaveats: Record<string, string> = {
  "default-line": "This variant loads CLAUDE.md files, so your own ~/.claude/CLAUDE.md loaded too. If it mentions artifacts.space, it raised these numbers.",
  skill: "This variant loads skills, so your own ~/.claude/skills loaded too.",
};

function caveatLines(variant: string) {
  const caveat = variantCaveats[variant];
  return caveat ? [caveat, ""] : [];
}

/** The Markdown report for one pass. */
export function renderMarkdown(summary: RoutingSummary, meta: { variant: string; model: string; startedAt: string }): string {
  return [
    `# Artifact routing eval: ${meta.variant}`,
    "",
    `Run ${meta.startedAt} on ${meta.model || "the default model"}. Runs with errors are left out of every count but their own row.`,
    "",
    ...caveatLines(meta.variant),
    "| Measure | Result |",
    "| --- | --- |",
    `| Saved to artifacts.space | ${summary.routed} of ${summary.shouldRoute} (${summary.routedPercent}%) |`,
    `| Saved there before any local file | ${summary.routedFirst} of ${summary.shouldRoute} (${summary.routedFirstPercent}%) |`,
    `| Near-miss false positives | ${summary.falsePositives} of ${summary.nearMisses} |`,
    `| Runs with errors (left out of the counts above) | ${summary.errors} |`,
    `| Estimated cost | $${summary.costUsd.toFixed(2)} |`,
    "",
    ...section("Misroutes", summary.misroutes),
    ...section("Saved, but went elsewhere first (file: wrote a local file; chat: only the stub's log showed the save)", summary.elsewhereFirstCases),
    ...section("Near-miss false positives", summary.falsePositiveCases),
    ...section("Runs with errors", summary.errorCases),
  ].join("\n");
}
