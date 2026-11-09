import { describe, expect, it } from "vitest";

import { defaultActor, defaultRoleCapabilities } from "./capability-rules";
import {
  canManageTeamIcon,
  centerSquare,
  checkTeamIconBytes,
  parseTeamIconKey,
  readPng,
  readWebp,
  TEAM_ICON_CACHE_SECONDS,
  TEAM_ICON_MAX_BYTES,
  teamIconCacheControl,
  teamIconKey,
  teamIconRateLimitChecks,
  teamIconSourceProblem,
  teamIconUrl,
  teamMonogram,
} from "./team-icon-rules";

const encoder = new TextEncoder();
const uuid = "7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a";

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function chunk(type: string, data: number[] = []): number[] {
  return [...u32be(data.length), ...encoder.encode(type), ...data, 0, 0, 0, 0];
}

/** A structurally valid PNG: signature, IHDR, extra chunks, IDAT, IEND, then `trailing` bytes. */
function png(width: number, height: number, options: { extra?: number[]; trailing?: number[] } = {}): Uint8Array<ArrayBuffer> {
  const ihdr = [...u32be(width), ...u32be(height), 8, 6, 0, 0, 0];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", ihdr), ...(options.extra ?? []), ...chunk("IDAT", [1, 2, 3, 4]), ...chunk("IEND"), ...(options.trailing ?? [])]);
}

/** A RIFF WebP around one chunk, with a correct RIFF length unless `riffLength` says otherwise. */
function webp(fourcc: string, payload: number[], riffLength?: number): Uint8Array<ArrayBuffer> {
  const body = [...encoder.encode("WEBP"), ...encoder.encode(fourcc), ...u32le(payload.length), ...payload];
  return new Uint8Array([...encoder.encode("RIFF"), ...u32le(riffLength ?? body.length), ...body]);
}

function vp8x(width: number, height: number, flags = 0): Uint8Array<ArrayBuffer> {
  const w = width - 1;
  const h = height - 1;
  return webp("VP8X", [flags, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff]);
}

function vp8l(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bits = (width - 1) | ((height - 1) << 14);
  return webp("VP8L", [0x2f, ...u32le(bits), 0, 0, 0, 0, 0]);
}

function vp8(width: number, height: number): Uint8Array<ArrayBuffer> {
  return webp("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, width & 0xff, (width >> 8) & 0x3f, height & 0xff, (height >> 8) & 0x3f, 0, 0]);
}

describe("canManageTeamIcon", () => {
  it("should let an owner change the icon of a shared team", () => {
    expect(canManageTeamIcon({ ...defaultActor("owner"), personal: false })).toBe(true);
  });

  it.each(["admin", "member"] as const)("should refuse a %s, whose role cannot change team settings by default", (role) => {
    expect(canManageTeamIcon({ ...defaultActor(role), personal: false })).toBe(false);
  });

  it("should let anyone whose role holds change team settings, such as a custom role", () => {
    expect(canManageTeamIcon({ roleKey: "brand", kind: "person", capabilities: ["settings.team"], personal: false })).toBe(true);
  });

  it("should refuse an admin whose role was narrowed even when it holds every other capability", () => {
    expect(canManageTeamIcon({ roleKey: "admin", kind: "person", capabilities: defaultRoleCapabilities.admin, personal: false })).toBe(false);
  });

  it("should refuse an agent even when its role lists change team settings", () => {
    expect(canManageTeamIcon({ roleKey: "owner", kind: "agent", capabilities: ["settings.team"], personal: false })).toBe(false);
  });

  it("should refuse the owner of a personal team, which has no icon", () => {
    expect(canManageTeamIcon({ ...defaultActor("owner"), personal: true })).toBe(false);
  });

  it("should refuse when there is no membership", () => {
    expect(canManageTeamIcon(null)).toBe(false);
  });
});

describe("teamIconSourceProblem", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("should accept a %s under 2 MB", (type) => {
    expect(teamIconSourceProblem({ type, size: 1000 })).toBeNull();
  });

  it.each(["image/svg+xml", "image/gif", "image/avif", "text/html", ""])("should refuse a file of type %j", (type) => {
    expect(teamIconSourceProblem({ type, size: 1000 })).toBe("Pick a PNG, JPEG, or WebP image.");
  });

  it("should refuse a file over 2 MB", () => {
    expect(teamIconSourceProblem({ type: "image/png", size: TEAM_ICON_MAX_BYTES + 1 })).toBe("Pick an image of 2 MB or less.");
  });

  it("should refuse an empty file", () => {
    expect(teamIconSourceProblem({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
});

describe("centerSquare", () => {
  it("should cut the middle of a wide picture", () => {
    expect(centerSquare(400, 200)).toEqual({ x: 100, y: 0, side: 200 });
  });

  it("should cut the middle of a tall picture", () => {
    expect(centerSquare(300, 901)).toEqual({ x: 0, y: 300, side: 300 });
  });

  it("should keep a square picture whole", () => {
    expect(centerSquare(256, 256)).toEqual({ x: 0, y: 0, side: 256 });
  });
});

describe("checkTeamIconBytes", () => {
  it("should accept a square PNG of 256 pixels", () => {
    expect(checkTeamIconBytes(png(256, 256))).toEqual({ ok: true, image: { type: "image/png", width: 256, height: 256 } });
  });

  it.each([["VP8X", vp8x(256, 256)], ["VP8L", vp8l(128, 128)], ["VP8", vp8(64, 64)]] as const)("should accept a square still WebP (%s)", (_name, bytes) => {
    const checked = checkTeamIconBytes(bytes);
    expect(checked.ok && checked.image.type).toBe("image/webp");
  });

  it("should refuse a picture that is not square", () => {
    expect(checkTeamIconBytes(png(256, 200))).toEqual({ ok: false, error: "The icon must be square." });
  });

  it.each([[512], [8]])("should refuse a square of %i pixels", (side) => {
    expect(checkTeamIconBytes(png(side, side)).ok).toBe(false);
  });

  it("should refuse bytes over 2 MB even when they start like a PNG", () => {
    const big = new Uint8Array(TEAM_ICON_MAX_BYTES + 1);
    big.set(png(256, 256));
    expect(checkTeamIconBytes(big)).toEqual({ ok: false, error: "The icon can be at most 2 MB." });
  });

  it("should refuse a JPEG, which the browser should have re-encoded", () => {
    expect(checkTeamIconBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(40).fill(0)])).ok).toBe(false);
  });

  it("should refuse SVG markup, whatever name or type it was sent with", () => {
    expect(checkTeamIconBytes(encoder.encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).ok).toBe(false);
  });

  it("should refuse a PNG with data after its end", () => {
    expect(readPng(png(256, 256, { trailing: [...encoder.encode("<html>")] }))).toBeNull();
  });

  it("should refuse a PNG whose IHDR is not 13 bytes, so its size is never read from the wrong bytes", () => {
    const bytes = png(256, 256);
    bytes[11] = 12;
    expect(readPng(bytes)).toBeNull();
  });

  it("should refuse an animated PNG", () => {
    expect(readPng(png(256, 256, { extra: chunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0]) }))).toBeNull();
  });

  it("should refuse a PNG whose chunk runs past the end", () => {
    const bytes = png(256, 256);
    expect(readPng(bytes.subarray(0, bytes.length - 6))).toBeNull();
  });

  it("should refuse an animated WebP", () => {
    expect(readWebp(vp8x(256, 256, 0x02))).toBeNull();
  });

  it("should refuse a WebP whose RIFF length does not match the file", () => {
    const bytes = vp8x(256, 256);
    const padded = new Uint8Array([...bytes, ...encoder.encode("<script>")]);
    expect(readWebp(padded)).toBeNull();
  });

  it("should refuse an empty upload", () => {
    expect(checkTeamIconBytes(new Uint8Array()).ok).toBe(false);
  });
});

describe("team icon keys", () => {
  it("should build a key under the team's own folder", () => {
    expect(teamIconKey("team_ABC-1", uuid, "image/webp")).toBe(`team-icons/team_ABC-1/${uuid}.webp`);
  });

  it("should refuse to build a key from a team id that could leave its folder", () => {
    expect(() => teamIconKey("../other", uuid, "image/png")).toThrow();
  });

  it("should read back the id and type of the team's own key", () => {
    expect(parseTeamIconKey("team-1", `team-icons/team-1/${uuid}.png`)).toEqual({ id: uuid, type: "image/png" });
  });

  it.each([
    [`team-icons/team-2/${uuid}.png`, "another team's icon"],
    [`files/${uuid}/logo.png`, "an artifact file"],
    [`team-icons/team-1/../team-2/${uuid}.png`, "a path that climbs out"],
    [`team-icons/team-1/${uuid}.svg`, "an SVG"],
    ["https://example.com/logo.png", "a URL"],
    ["", "an empty key"],
  ])("should never treat %s as this team's icon (%s)", (key) => {
    expect(parseTeamIconKey("team-1", key)).toBeNull();
    expect(teamIconUrl("team-1", key)).toBeNull();
  });

  it("should point at the members-only route with the icon's id as its version", () => {
    expect(teamIconUrl("team-1", `team-icons/team-1/${uuid}.png`)).toBe(`/api/teams/team-1/icon?v=${uuid}`);
  });

  it("should have no URL when the team has no icon", () => {
    expect(teamIconUrl("team-1", null)).toBeNull();
  });
});

describe("teamIconCacheControl", () => {
  it("should let only the member's browser keep the icon for a day when the URL names the current icon", () => {
    expect(teamIconCacheControl(uuid, uuid)).toBe("private, max-age=86400, immutable");
    expect(TEAM_ICON_CACHE_SECONDS).toBe(86_400);
  });

  it("should keep nothing when the URL names a replaced icon, so the new one shows at once", () => {
    expect(teamIconCacheControl("00000000-0000-4000-8000-000000000000", uuid)).toBe("private, no-store");
  });

  it("should keep nothing when the URL has no version", () => {
    expect(teamIconCacheControl(null, uuid)).toBe("private, no-store");
  });

  it.each([[uuid], [null], ["other"]])("should never let a shared cache or CDN store an icon when v is %s", (version) => {
    const value = teamIconCacheControl(version, uuid);
    expect(value).toMatch(/^private,/);
    expect(value).not.toMatch(/public|s-maxage/);
  });
});

describe("teamIconRateLimitChecks", () => {
  it("should key a member's icon views by their own id, plus the network backstop", () => {
    expect(teamIconRateLimitChecks("user-1", "network-1")).toEqual([
      { name: "teamIconByUser", subject: "user-1" },
      { name: "teamIconByNetwork", subject: "network-1" },
    ]);
  });

  it("should give two people behind one address separate budgets", () => {
    const [first] = teamIconRateLimitChecks("user-1", "office");
    const [second] = teamIconRateLimitChecks("user-2", "office");
    expect(first?.subject).not.toBe(second?.subject);
  });

  it("should count a signed-out request against the network only", () => {
    expect(teamIconRateLimitChecks(null, "network-1")).toEqual([{ name: "teamIconByNetwork", subject: "network-1" }]);
  });
});

describe("teamMonogram", () => {
  it("should use the first letter of the name, upper-cased", () => {
    expect(teamMonogram("acme design")).toBe("A");
  });

  it("should skip leading symbols and keep letters from any script", () => {
    expect(teamMonogram("  #équipe")).toBe("É");
  });

  it("should give the same letter on every locale when the name starts with i", () => {
    expect(teamMonogram("istanbul")).toBe("I");
  });

  it("should fall back to T when the name has no letter or digit", () => {
    expect(teamMonogram("--")).toBe("T");
  });
});
