import { describe, expect, it } from "vitest";

import { MissingPageTokenSecretError, mintPageToken, mintShorterPageToken, openPageToken, pageTokenLimits, pageTokenPattern, pageTokenSecret, type PageGrant } from "./token";

const secret = "unit-test-secret-0123456789-abcdefghijklmnop";
const label = "0123456789abcdef0123456789abcdef";
const otherLabel = "fedcba9876543210fedcba9876543210";
const at = new Date("2026-11-17T12:02:30.000Z");
const grant: PageGrant = { artifactId: "artifact-internal-id", label, asOf: null, stamp: 1_794_000_000_000 };

describe("page files token", () => {
  it("should open on its own page host with what it was made for when it is fresh", () => {
    const { token, expiresAt } = mintPageToken(grant, at, secret);
    expect(token).toMatch(pageTokenPattern);
    expect(openPageToken(token, label, at, secret)).toEqual({ artifactId: "artifact-internal-id", asOf: null, expiresAt });
  });

  it("should carry the time of the version it is for when the reader is served an older one", () => {
    const asOf = new Date("2026-11-01T08:00:00.123Z");
    const { token } = mintPageToken({ ...grant, asOf }, at, secret);
    expect(openPageToken(token, label, at, secret)?.asOf).toEqual(asOf);
  });

  it("should refuse a token made for another page host", () => {
    const { token } = mintPageToken(grant, at, secret);
    expect(openPageToken(token, otherLabel, at, secret)).toBeNull();
  });

  it("should refuse a token once it has ended, and open it until then", () => {
    const { token, expiresAt } = mintPageToken(grant, at, secret);
    expect(openPageToken(token, label, new Date(expiresAt.getTime() - 1), secret)).not.toBeNull();
    expect(openPageToken(token, label, expiresAt, secret)).toBeNull();
    expect(openPageToken(token, label, new Date(expiresAt.getTime() + 60_000), secret)).toBeNull();
  });

  it("should refuse a token when any character of it was changed", () => {
    const { token } = mintPageToken(grant, at, secret);
    for (let index = 0; index < token.length; index += 1) {
      const swapped = `${token.slice(0, index)}${token[index] === "A" ? "B" : "A"}${token.slice(index + 1)}`;
      expect(openPageToken(swapped, label, at, secret), `character ${String(index)}`).toBeNull();
    }
  });

  it("should refuse a token made under another secret", () => {
    const { token } = mintPageToken(grant, at, "another-secret-0123456789-abcdefghijklmnop");
    expect(openPageToken(token, label, at, secret)).toBeNull();
  });

  it("should refuse text that is not a token", () => {
    for (const text of ["", "x", "../../etc/passwd", "a".repeat(59), "a".repeat(401), `${"a".repeat(80)}.`, "a".repeat(80)]) {
      expect(openPageToken(text, label, at, secret), text.slice(0, 20)).toBeNull();
    }
  });

  it("should not show the artifact's id in the token", () => {
    const { token } = mintPageToken(grant, at, secret);
    expect(Buffer.from(token, "base64url").toString("latin1")).not.toContain("artifact-internal-id");
    expect(token).not.toContain(Buffer.from("artifact-internal-id").toString("base64url").slice(0, 12));
  });

  it("should give the same token within one step and a new one in the next, so repeat views reuse one address", () => {
    const first = mintPageToken(grant, new Date("2026-11-17T12:00:00.000Z"), secret);
    const later = mintPageToken(grant, new Date("2026-11-17T12:04:59.999Z"), secret);
    const next = mintPageToken(grant, new Date("2026-11-17T12:05:00.000Z"), secret);
    expect(later.token).toBe(first.token);
    expect(next.token).not.toBe(first.token);
  });

  it("should work for at least ten and at most fifteen minutes", () => {
    for (const second of [0, 1, 150, 299]) {
      const now = new Date(Date.parse("2026-11-17T12:00:00.000Z") + second * 1000);
      const life = (mintPageToken(grant, now, secret).expiresAt.getTime() - now.getTime()) / 1000;
      expect(life).toBeLessThanOrEqual(pageTokenLimits.lifeSeconds);
      expect(life).toBeGreaterThan(pageTokenLimits.lifeSeconds - pageTokenLimits.stepSeconds);
    }
  });

  it("should give a new token when the artifact was saved, the version changes, or the artifact is another one", () => {
    const base = mintPageToken(grant, at, secret).token;
    expect(mintPageToken({ ...grant, stamp: grant.stamp + 1 }, at, secret).token).not.toBe(base);
    expect(mintPageToken({ ...grant, asOf: new Date(5) }, at, secret).token).not.toBe(base);
    expect(mintPageToken({ ...grant, artifactId: "another" }, at, secret).token).not.toBe(base);
    expect(mintPageToken({ ...grant, label: otherLabel }, at, secret).token).not.toBe(base);
  });

  it("should refuse to work without the server secret", () => {
    expect(() => pageTokenSecret({})).toThrow(MissingPageTokenSecretError);
    expect(() => pageTokenSecret({ BETTER_AUTH_SECRET: "  " })).toThrow(MissingPageTokenSecretError);
    expect(pageTokenSecret({ BETTER_AUTH_SECRET: " s " })).toBe("s");
  });
});

describe("a token that ends sooner", () => {
  it("should end when it was asked to, and open until then", () => {
    const endsAt = new Date(at.getTime() + 8_000);
    const { token, expiresAt } = mintShorterPageToken(grant, endsAt, at, secret);
    expect(expiresAt.getTime()).toBe(Math.floor(endsAt.getTime() / 1000) * 1000);
    expect(openPageToken(token, label, at, secret)).not.toBeNull();
    expect(openPageToken(token, label, expiresAt, secret)).toBeNull();
  });

  it("should never make a token that outlives the usual one", () => {
    const usual = mintPageToken(grant, at, secret).expiresAt;
    expect(mintShorterPageToken(grant, usual, at, secret).expiresAt).toEqual(usual);
    expect(() => mintShorterPageToken(grant, new Date(usual.getTime() + 1_000), at, secret)).toThrow(RangeError);
    expect(() => mintShorterPageToken(grant, new Date(at.getTime() + 24 * 3_600_000), at, secret)).toThrow(RangeError);
  });
});
