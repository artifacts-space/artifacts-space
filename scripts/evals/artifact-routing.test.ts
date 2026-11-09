import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { casesFileSchema, firstRoute, gradeCase, parseTranscript, renderMarkdown, runError, summarize, toolSearches, type RoutingCase, type Transcript } from "./artifact-routing-grade.mts";
import { claudeArgs, readStubCalls } from "./artifact-routing.mts";

function streamLine(value: unknown) {
  return JSON.stringify(value);
}

const init = streamLine({ type: "system", subtype: "init", model: "claude-test", mcp_servers: [{ name: "artifacts", status: "connected" }] });

function assistant(...calls: { name: string; input?: unknown }[]) {
  return streamLine({ type: "assistant", message: { content: [{ type: "text", text: "Working." }, ...calls.map((call) => ({ type: "tool_use", id: "t", name: call.name, input: call.input ?? {} }))] } });
}

const result = streamLine({ type: "result", total_cost_usd: 0.12, num_turns: 3, is_error: false });

function transcriptOf(...lines: string[]): Transcript {
  return parseTranscript([init, ...lines, result].join("\n"));
}

const planCase: RoutingCase = { id: "plan", expect: "artifacts", prompt: "Write up the plan." };
const nearCase: RoutingCase = { id: "near", expect: "elsewhere", prompt: "What is a mutex?" };

describe("parseTranscript", () => {
  it("should collect tool calls, cost, model, and the stub's status when the output is stream-json", () => {
    const transcript = transcriptOf(assistant({ name: "ToolSearch", input: { query: "save doc" } }), assistant({ name: "mcp__artifacts__artifacts_create" }));
    expect(transcript.calls.map((call) => call.name)).toEqual(["ToolSearch", "mcp__artifacts__artifacts_create"]);
    expect(transcript.costUsd).toBe(0.12);
    expect(transcript.model).toBe("claude-test");
    expect(transcript.artifactsServer).toBe("connected");
  });

  it("should skip lines that are not JSON when the CLI prints warnings", () => {
    const transcript = parseTranscript(["warning: something", init, result].join("\n"));
    expect(transcript.calls).toEqual([]);
    expect(transcript.artifactsServer).toBe("connected");
  });

  it("should report the stub as missing when the init event does not list it", () => {
    expect(parseTranscript(streamLine({ type: "system", subtype: "init", mcp_servers: [] })).artifactsServer).toBe("missing");
  });
});

describe("firstRoute", () => {
  it("should say file when the agent wrote a local file before it saved an artifact", () => {
    expect(firstRoute([{ name: "Write", input: {} }, { name: "mcp__artifacts__artifacts_create", input: {} }])).toBe("file");
  });

  it("should say builtin-artifact when the agent used Claude Code's Artifact tool", () => {
    expect(firstRoute([{ name: "Artifact", input: {} }])).toBe("builtin-artifact");
  });

  it("should say chat when the agent only read and searched", () => {
    expect(firstRoute([{ name: "Read", input: {} }, { name: "mcp__artifacts__artifacts_list", input: {} }])).toBe("chat");
  });
});

describe("gradeCase", () => {
  it("should pass a prompt that expects artifacts when the agent saved one", () => {
    expect(gradeCase(planCase, transcriptOf(assistant({ name: "mcp__artifacts__artifacts_create" }))).passed).toBe(true);
  });

  it("should fail a prompt that expects artifacts when the agent only answered in chat", () => {
    expect(gradeCase(planCase, transcriptOf()).passed).toBe(false);
  });

  it("should fail a near miss when the agent saved an artifact anyway", () => {
    const graded = gradeCase(nearCase, transcriptOf(assistant({ name: "mcp__artifacts__artifacts_update" })));
    expect(graded.saved).toBe(true);
    expect(graded.passed).toBe(false);
  });

  it("should fail any run that errored, even when nothing was saved", () => {
    expect(gradeCase(nearCase, transcriptOf(), { error: "timed out" }).passed).toBe(false);
  });

  it("should count a save the stub recorded when the transcript missed it", () => {
    const graded = gradeCase(planCase, transcriptOf(), { stubCalls: ["mcp__artifacts__artifacts_list", "mcp__artifacts__artifacts_create"] });
    expect(graded.saved).toBe(true);
    expect(graded.passed).toBe(true);
  });
});

describe("runError", () => {
  const failedRun = streamLine({ type: "result", subtype: "error_max_turns", is_error: true, result: "Reached the maximum number of turns (8)", total_cost_usd: 0.2 });

  it("should give the reason and fail the case when Claude Code reports is_error", () => {
    const transcript = parseTranscript([init, failedRun].join("\n"));
    const graded = gradeCase(nearCase, transcript, { error: runError(transcript) });
    expect(graded.error).not.toBe("");
    expect(graded.error).toMatch(/error_max_turns/);
    expect(graded.error).toMatch(/maximum number of turns/);
    expect(graded.passed).toBe(false);
  });

  it("should say the stub did not connect, with stderr, when the init event lists it as failed", () => {
    const transcript = parseTranscript(streamLine({ type: "system", subtype: "init", mcp_servers: [{ name: "artifacts", status: "failed" }] }));
    expect(runError(transcript, "Cannot find module")).toBe("artifacts stub failed: Cannot find module");
  });

  it("should be empty when the run ended cleanly", () => {
    expect(runError(transcriptOf())).toBe("");
  });
});

describe("summarize", () => {
  it("should keep errored runs out of the routed count and list them with their reason", () => {
    const saved = transcriptOf(assistant({ name: "mcp__artifacts__artifacts_create" }));
    const summary = summarize([gradeCase(planCase, saved, { error: "claude ended with an error (error_max_turns)" })]);
    expect(summary.routed).toBe(0);
    expect(summary.shouldRoute).toBe(0);
    expect(summary.misroutes).toEqual([]);
    expect(summary.errors).toBe(1);
    expect(renderMarkdown(summary, { variant: "mcp", model: "m", startedAt: "t" })).toMatch(/error_max_turns/);
  });

  it("should count a prompt as routed first only when it saved before writing a local file", () => {
    const fileFirst = transcriptOf(assistant({ name: "Write" }), assistant({ name: "mcp__artifacts__artifacts_create" }));
    const summary = summarize([gradeCase(planCase, fileFirst), gradeCase({ ...planCase, id: "plan-2" }, transcriptOf(assistant({ name: "mcp__artifacts__artifacts_create" })))]);
    expect(summary.routed).toBe(2);
    expect(summary.routedFirst).toBe(1);
    expect(summary.elsewhereFirstCases.map((item) => item.id)).toEqual(["plan"]);
  });

  it("should count an errored near miss that saved only as an error, never as a false positive", () => {
    const saved = transcriptOf(assistant({ name: "mcp__artifacts__artifacts_create" }));
    const summary = summarize([gradeCase(nearCase, saved, { error: "timed out after 240s" }), gradeCase({ ...nearCase, id: "near-2" }, transcriptOf())]);
    expect(summary.falsePositives).toBe(0);
    expect(summary.falsePositiveCases).toEqual([]);
    expect(summary.nearMisses).toBe(1);
    expect(summary.errors).toBe(1);
  });

  it("should note in the report that the default-line variant also loads the operator's own CLAUDE.md", () => {
    expect(renderMarkdown(summarize([]), { variant: "default-line", model: "m", startedAt: "t" })).toMatch(/~\/\.claude\/CLAUDE\.md loaded too/);
    expect(renderMarkdown(summarize([]), { variant: "mcp", model: "m", startedAt: "t" })).not.toMatch(/loaded too/);
  });

  it("should count routed prompts and near-miss false positives separately", () => {
    const saved = transcriptOf(assistant({ name: "mcp__artifacts__artifacts_create" }));
    const summary = summarize([gradeCase(planCase, saved), gradeCase({ ...planCase, id: "plan-2" }, transcriptOf()), gradeCase(nearCase, saved)]);
    expect(summary.routed).toBe(1);
    expect(summary.shouldRoute).toBe(2);
    expect(summary.routedPercent).toBe(50);
    expect(summary.falsePositives).toBe(1);
    expect(summary.misroutes.map((item) => item.id)).toEqual(["plan-2"]);
    expect(summary.costUsd).toBe(0.36);
  });
});

describe("toolSearches", () => {
  it("should list the agent's tool search queries when it searched", () => {
    expect(toolSearches([{ name: "ToolSearch", input: { query: "artifact doc" } }, { name: "Read", input: { query: "x" } }])).toEqual(["artifact doc"]);
  });
});

describe("claudeArgs", () => {
  it("should load only the stub server and allow only its tools when it builds a run", () => {
    const args = claudeArgs("Write it up.", "/tmp/mcp.json", { variant: "mcp", model: "", maxTurns: 8 });
    expect(args).toEqual(expect.arrayContaining(["--strict-mcp-config", "--allowedTools", "mcp__artifacts", "--disable-slash-commands", "--no-session-persistence"]));
    expect(args).not.toContain("--model");
  });

  it("should keep skills on when the variant is skill", () => {
    expect(claudeArgs("x", "/tmp/mcp.json", { variant: "skill", model: "opus", maxTurns: 8 })).not.toContain("--disable-slash-commands");
  });
});

describe("readStubCalls", () => {
  it("should read the stub's log as full tool names and skip broken lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "routing-log-"));
    try {
      const logPath = join(dir, "calls.jsonl");
      writeFileSync(logPath, `${JSON.stringify({ tool: "artifacts_create", args: {} })}\n{"tool":\n`);
      expect(readStubCalls(logPath)).toEqual(["mcp__artifacts__artifacts_create"]);
      expect(readStubCalls(join(dir, "missing.jsonl"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("artifact-routing-cases.json", () => {
  const { cases } = casesFileSchema.parse(JSON.parse(readFileSync(new URL("./artifact-routing-cases.json", import.meta.url), "utf8")));

  it("should hold about 30 prompts with unique ids, mostly ones that should route", () => {
    expect(cases.length).toBeGreaterThanOrEqual(25);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    const near = cases.filter((item) => item.expect === "elsewhere").length;
    expect(near).toBeGreaterThanOrEqual(5);
    expect(near).toBeLessThan(cases.length / 2);
  });
});
