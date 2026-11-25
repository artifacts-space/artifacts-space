import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { pageImageLimits, pageImageRefusals, screenshotRequestBody } from "./rules";

/** The MCP route's `maxDuration`, read from its source: segment config must stay a literal there, so it cannot be imported. */
function mcpRouteSeconds(): number {
  const source = readFileSync(join(process.cwd(), "src/app/api/mcp/route.ts"), "utf8");
  const match = /export const maxDuration = (\d+);/.exec(source);
  if (!match?.[1]) throw new Error("The MCP route no longer sets maxDuration as a number.");
  return Number(match[1]);
}

describe("the draw's time budget", () => {
  it("should fit every wait of the browser inside the request's own limit", () => {
    const { loadTimeoutMs, shownTimeoutMs, settleMs, requestTimeoutMs } = pageImageLimits;
    expect(loadTimeoutMs + shownTimeoutMs + settleMs).toBeLessThan(requestTimeoutMs);
  });

  it("should leave the MCP route time to answer when the request runs to its limit", () => {
    expect(pageImageLimits.requestTimeoutMs + pageImageLimits.routeHeadroomMs).toBeLessThanOrEqual(mcpRouteSeconds() * 1000);
  });

  it("should send the browser the same waits the budget counts", () => {
    const body = screenshotRequestBody("https://artifacts.space/render/page/t", { width: 1280, height: 800 });
    expect(body.gotoOptions.timeout).toBe(pageImageLimits.loadTimeoutMs);
    expect(body.waitForSelector.timeout).toBe(pageImageLimits.shownTimeoutMs);
    expect(body.waitForTimeout).toBe(pageImageLimits.settleMs);
  });

  it("should name the time the page had to start when it was not drawn", () => {
    expect(pageImageRefusals.notDrawn.message).toContain(`${String((pageImageLimits.loadTimeoutMs + pageImageLimits.shownTimeoutMs) / 1000)} seconds`);
  });
});
