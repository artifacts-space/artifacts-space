import { describe, expect, it } from "vitest";

import { docsMcpTools } from "@/lib/docs/mcp-tools";
import { htmlProblem } from "@/lib/html/rules";

import { holdDays, pageSourceStart, planCopy, planSteps, ramp, rampDays, rampPath } from "./demo-artifact";
import { demoCalls, demoListRows, demoPeople, demoPrompt, HOLD, replayCycleMs, reviewerReply, T, typedAt } from "./demo-story";

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
  const savesWithContent = demoCalls.filter((call) => call.args.some(([key]) => key === "content"));

  it("should save a web page when the agent calls artifacts_create", () => {
    const create = demoCalls.find((call) => call.tool === "artifacts_create");
    expect(create?.args).toContainEqual(["kind", "html"]);
  });

  it("should send content an HTML artifact accepts when a call carries the page", () => {
    expect(savesWithContent.length).toBeGreaterThanOrEqual(2);
    for (const call of savesWithContent) {
      const content = call.args.find(([key]) => key === "content")?.[1] ?? "";
      expect(htmlProblem(content), call.tool).toBeNull();
      expect(content).toBe(pageSourceStart);
    }
  });

  it("should never name an earlier format when the demo shows a kind", () => {
    const kinds = [...demoCalls.flatMap((call) => call.args.filter(([key]) => key === "kind").map(([, value]) => value)), ...demoListRows.map((row) => row.kind)];
    expect(kinds).not.toContain("ui");
    expect(kinds).not.toContain("canvas");
  });

  it("should hold at 5% over the weekend and still reach all traffic when the agent saves version 2", () => {
    const held = ramp[2].slice(holdDays.first, holdDays.last + 1);
    expect(held).toEqual([5, 5, 5]);
    expect(rampDays.slice(holdDays.first, holdDays.last + 1)).toEqual(["Fri", "Sat", "Sun"]);
    expect(ramp[1].at(-1)).toBe(100);
    expect(ramp[2].at(-1)).toBe(100);
    expect(ramp[1]).toHaveLength(rampDays.length);
    expect(ramp[2]).toHaveLength(rampDays.length);
  });

  it("should change the headline, the steps, and the chart when the agent saves version 2", () => {
    expect(planCopy[2].title).not.toBe(planCopy[1].title);
    expect(planSteps[2]).not.toEqual(planSteps[1]);
    expect(rampPath(2)).not.toBe(rampPath(1));
    expect(planSteps[2].some((step) => step.title.includes("Hold"))).toBe(true);
  });

  it("should list a step for every rise the chart draws when either version is shown", () => {
    for (const version of [1, 2] as const) {
      const rises = ramp[version].flatMap((value, day) => (day === 0 || value !== ramp[version][day - 1] ? [`${String(value)}% of traffic ${rampDays[day] ?? ""}`] : []));
      const steps = planSteps[version].filter((step) => step.title.endsWith("of traffic")).map((step) => `${step.title} ${step.time}`);
      expect(steps, `version ${String(version)}`).toEqual(rises);
    }
  });

  it("should close the chart's area along the bottom when the path is filled", () => {
    expect(rampPath(1, true)).toMatch(/^M0,95L.*L100,100L0,100Z$/);
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
