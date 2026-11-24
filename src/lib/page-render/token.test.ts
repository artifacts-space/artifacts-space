import { describe, expect, it } from "vitest";

import { mintPageToken, openPageToken } from "@/lib/page-files/token";

import { mintRenderToken, openRenderToken, renderTokenLimits, renderTokenPattern } from "./token";

const secret = "a test secret that is long enough to derive keys from";
const grant = { userId: "user-1", artifactId: "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f", stamp: 1_763_942_400_000 };
const now = new Date("2026-11-24T12:00:00.000Z");

describe("render tokens", () => {
  it("should open to the grant it was made for when it has not ended", () => {
    const token = mintRenderToken(grant, now, secret);
    expect(renderTokenPattern.test(token)).toBe(true);
    expect(openRenderToken(token, new Date(now.getTime() + 60_000), secret)).toEqual(grant);
  });

  it("should open nothing when it has ended", () => {
    const token = mintRenderToken(grant, now, secret);
    expect(openRenderToken(token, new Date(now.getTime() + renderTokenLimits.lifeSeconds * 1000), secret)).toBeNull();
  });

  it("should open nothing when it was made under another secret", () => {
    const token = mintRenderToken(grant, now, secret);
    expect(openRenderToken(token, now, `${secret} but another`)).toBeNull();
  });

  it("should open nothing when one character was changed", () => {
    const token = mintRenderToken(grant, now, secret);
    const last = token.at(-1) === "A" ? "B" : "A";
    expect(openRenderToken(`${token.slice(0, -1)}${last}`, now, secret)).toBeNull();
  });

  it("should not show the caller or the artifact's internal id in the token", () => {
    const token = mintRenderToken(grant, now, secret);
    const decoded = Buffer.from(token, "base64url").toString("latin1");
    expect(decoded).not.toContain(grant.userId);
    expect(decoded).not.toContain(grant.artifactId);
  });

  it("should not open as a page files token, nor a page files token as a render token", () => {
    const render = mintRenderToken(grant, now, secret);
    expect(openPageToken(render, "a".repeat(32), now, secret)).toBeNull();
    const files = mintPageToken({ artifactId: grant.artifactId, label: "a".repeat(32), asOf: null, stamp: grant.stamp }, now, secret);
    expect(openRenderToken(files.token, now, secret)).toBeNull();
  });
});
