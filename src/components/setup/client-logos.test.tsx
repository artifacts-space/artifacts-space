import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { clientGuides, FxGuide } from "@/components/setup/client-guides";
import { mcpClients } from "@/lib/setup/client-installs";

import { ClientLogo } from "./client-logos";

const origin = "https://artifacts.space";
const endpoint = "https://artifacts.space/api/mcp";

/** A literal color in markup: hex, rgb(), hsl(), or oklch(). */
const literalColor = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/i;

/** Clients shown with their label alone: Devin has no mark, by the owner's choice. */
const withoutMark = new Set(["devin"]);

describe("ClientLogo", () => {
  it.each(mcpClients.filter((client) => !withoutMark.has(client.id)).map((client) => [client.label, client.id] as const))("should draw a hidden mark in the text color when showing %s", (_label, id) => {
    const html = renderToStaticMarkup(<ClientLogo id={id} />);
    expect(html).toMatch(/^<svg /);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('fill="currentColor"');
    expect(html).not.toMatch(literalColor);
  });

  it("should draw no mark for Devin, only a hidden spacer the size of one, so labels stay aligned", () => {
    const html = renderToStaticMarkup(<ClientLogo id="devin" />);
    expect(html).not.toContain("<svg");
    expect(html).toMatch(/^<span aria-hidden="true" data-client-logo-spacer=""/);
    expect(html).toContain("size-4");
  });

  it("should carry no title or label of its own when the visible text names the client", () => {
    const html = renderToStaticMarkup(<ClientLogo id="opencode" />);
    expect(html).not.toContain("<title");
    expect(html).not.toContain("aria-label");
  });
});

describe("client guides", () => {
  it.each(mcpClients.map((client) => [client.label, client.id] as const))("should point %s at the canonical endpoint with no local process when rendered", (_label, id) => {
    const Guide = clientGuides[id];
    const html = renderToStaticMarkup(<Guide origin={origin} full />);
    expect(html).toContain(endpoint);
    expect(html).not.toMatch(/\bnpx\b|mcp-remote|stdio|&quot;command&quot;/);
  });

  it("should give fx its install, sign-in, skill, and check steps when rendered in full", () => {
    const html = renderToStaticMarkup(<FxGuide origin={origin} full />);
    for (const step of ["fx.sh/setup.sh", `fx mcp add artifacts ${endpoint}`, "fx mcp login artifacts", "/skills install artifacts-space/skills", "fx mcp show artifacts"]) {
      expect(html).toContain(step);
    }
  });
});
