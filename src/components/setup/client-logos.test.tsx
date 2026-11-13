import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { openAiMark } from "@/components/harness/openai-mark";
import { ChatGptGuide, clientGuides, FxGuide } from "@/components/setup/client-guides";
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

  it("should draw the same OpenAI mark as the harness icon file when showing ChatGPT", () => {
    const iconFile = readFileSync(join(process.cwd(), "public/agent-icons/codex.svg"), "utf8");
    expect(iconFile).toContain(`d="${openAiMark.path}"`);
    expect(iconFile).toContain(`viewBox="${openAiMark.viewBox}"`);
    expect(renderToStaticMarkup(<ClientLogo id="chatgpt" />)).toContain(`d="${openAiMark.path}"`);
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

  it("should never show the server URL as plain inline code when a guide names it in its steps", () => {
    for (const client of mcpClients) {
      const Guide = clientGuides[client.id];
      const html = renderToStaticMarkup(<Guide origin={origin} full />);
      expect(html, client.label).not.toContain(`<code>${endpoint}</code>`);
    }
    for (const id of ["claude-desktop", "chatgpt", "codex", "grok-bot", "devin", "other-clients"] as const) {
      const Guide = clientGuides[id];
      expect(renderToStaticMarkup(<Guide origin={origin} />), id).toContain(`aria-label="Copy ${endpoint}"`);
    }
  });

  it("should send ChatGPT to Plugins with OAuth and no client ID when rendered in full", () => {
    const html = renderToStaticMarkup(<ChatGptGuide origin={origin} full />);
    for (const step of ['href="https://chatgpt.com/plugins"', "Add custom MCP server", `aria-label="Copy ${endpoint}"`, "<strong>OAuth</strong>", "Leave the client ID and secret empty", "Create as a plugin", "You do not need Developer mode", "<strong>via ChatGPT</strong>"]) {
      expect(html).toContain(step);
    }
  });

  it("should say Pro can read and writes need a team plan when the short ChatGPT guide names the plans", () => {
    const html = renderToStaticMarkup(<ChatGptGuide origin={origin} />);
    expect(html).toContain("On ChatGPT Pro, ChatGPT can use the read tools");
    expect(html).toContain("To save or change them, you need a Business, Enterprise, or Edu workspace.");
    expect(html).not.toContain("does not work on Pro");
    expect(html).not.toContain("Developer mode");
  });
});
