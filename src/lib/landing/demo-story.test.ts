import { describe, expect, it } from "vitest";

import { docsMcpTools } from "@/lib/docs/mcp-tools";
import { validateUiSpec } from "@/lib/ui/validate";

import { demoArtifactContent, demoPieceContent, demoPieces } from "./demo-artifact";
import { demoCalls, demoPeople, demoPrompt, HOLD, replayCycleMs, reviewerReply, T, typedAt } from "./demo-story";

const registered = new Map(docsMcpTools().map((tool) => [tool.name as string, new Set(tool.args.map((arg) => arg.name))]));

describe("landing demo: fidelity to the MCP server", () => {
  it("should only call tools the server registers when the terminal shows a call", () => {
    expect(demoCalls.length).toBeGreaterThan(0);
    for (const call of demoCalls) expect(registered.has(call.tool), call.tool).toBe(true);
  });

  it("should only pass argument keys the tool's schema declares when the terminal shows arguments", () => {
    for (const call of demoCalls) {
      for (const [key] of call.args) expect(registered.get(call.tool)?.has(key), `${call.tool}.${key}`).toBe(true);
    }
  });

  it("should keep every argument value short when the terminal prints it", () => {
    for (const call of demoCalls) {
      for (const [, value] of call.args) expect(value.length, value).toBeLessThanOrEqual(60);
    }
  });

  it("should mention the agent in the reply when inbox_list reads it back", () => {
    const inbox = demoCalls.find((call) => call.tool === "inbox_list");
    expect(inbox?.result).toContain(reviewerReply);
    expect(demoPrompt).toContain(`@${demoPeople.reviewer.handle}`);
  });
});

describe("landing demo: the artifact", () => {
  it("should render both versions of the page with no issues when validated as a ui artifact", () => {
    for (const version of [1, 2] as const) {
      const result = validateUiSpec(demoArtifactContent(version));
      expect(result.renderable).toBe(true);
      expect(result.issues).toEqual([]);
    }
  });

  it("should render every piece on its own with no issues when the demo builds it", () => {
    for (const piece of demoPieces) {
      for (const version of [1, 2] as const) {
        expect(validateUiSpec(demoPieceContent(piece, version)).issues, `${piece} v${String(version)}`).toEqual([]);
      }
    }
  });

  it("should change the plan when the agent saves version 2", () => {
    expect(demoArtifactContent(2)).not.toBe(demoArtifactContent(1));
    expect(demoPieceContent("board", 2)).toBe(demoPieceContent("board", 1));
  });
});

describe("landing demo: timing", () => {
  it("should land each call's result after the call and before the next call", () => {
    demoCalls.forEach((call, index) => {
      expect(call.resultAt).toBeGreaterThan(call.at);
      const next = demoCalls[index + 1];
      if (next) expect(next.at).toBeGreaterThan(call.resultAt);
    });
  });

  it("should finish typing the prompt before it is sent", () => {
    expect(typedAt(demoPrompt.length - 1)).toBeLessThan(T.send);
  });

  it("should tell the whole story in 10 to 15 seconds when it plays", () => {
    const story = Math.max(...Object.values(T));
    expect(story).toBeGreaterThanOrEqual(10);
    expect(story).toBeLessThanOrEqual(15);
    expect(replayCycleMs()).toBe(Math.round((story + 1 + HOLD) * 1000));
  });
});
