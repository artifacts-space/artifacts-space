import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { casesFileSchema, claudeArgs, firstRoute, gradeCase, parseTranscript, summarize, toolSearches, type RoutingCase, type Transcript } from "./artifact-routing.mjs";

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
    expect(gradeCase(nearCase, transcriptOf(), "timed out").passed).toBe(false);
  });
});

describe("summarize", () => {
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
