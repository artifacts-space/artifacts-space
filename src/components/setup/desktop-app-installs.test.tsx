import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ClaudeDesktopGuide, CodexGuide, GrokBotGuide } from "@/components/setup/client-guides";
import { desktopApps } from "@/lib/setup/client-installs";

import { DesktopAppInstalls } from "./desktop-app-installs";

const origin = "https://artifacts.space";
const endpoint = "https://artifacts.space/api/mcp";
const claudeLink = "https://claude.ai/customize/connectors?modal=add-custom-connector&amp;connectorName=artifacts.space&amp;connectorUrl=https%3A%2F%2Fartifacts.space%2Fapi%2Fmcp";

/** Each button's markup, in the order the row shows them. */
function buttons(html: string): string[] {
  return html.match(/<(a|button)[^>]*data-install="[^"]+"[^>]*>.*?<\/\1>/g) ?? [];
}

describe("DesktopAppInstalls", () => {
  const html = renderToStaticMarkup(<DesktopAppInstalls origin={origin} apps={desktopApps} />);

  it("should show one button per app, in order, each with the app's mark before its label when the row renders", () => {
    const row = buttons(html);
    expect(row.map((button) => /data-install="([^"]+)"/.exec(button)?.[1])).toEqual(["cursor", "claude-desktop", "codex", "grok-bot"]);
    expect(row.map((button) => button.replace(/<svg.*?<\/svg>/g, "").replace(/<[^>]+>/g, ""))).toEqual(["Add to Cursor", "Add to Claude (opens in a new tab)", "Add to Codex", "Add to Grok Bot"]);
    for (const button of row) {
      expect(button).toMatch(/^<(a|button)[^>]*><svg [^>]*data-client-logo=""/);
    }
  });

  it("should link Cursor to its install deeplink and Claude to its prefilled form in a new tab when an install link exists", () => {
    const [cursor, claude] = buttons(html);
    expect(cursor).toMatch(/^<a [^>]*href="cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=artifacts&amp;config=/);
    expect(claude).toContain(`href="${claudeLink}"`);
    expect(claude).toContain('target="_blank"');
    expect(claude).toContain('rel="noopener noreferrer"');
  });

  it("should give Codex and Grok Bot a button that opens their steps, never a link, when no install link exists", () => {
    const [, , codex, grok] = buttons(html);
    for (const button of [codex, grok]) {
      expect(button).toMatch(/^<button /);
      expect(button).toContain('aria-haspopup="dialog"');
      expect(button).not.toContain("href=");
    }
  });

  it("should show only the apps it is given when the list is shorter", () => {
    const one = renderToStaticMarkup(<DesktopAppInstalls origin={origin} apps={["codex"]} />);
    expect(buttons(one)).toHaveLength(1);
    expect(one).toContain("Add to Codex");
  });
});

describe("desktop app guides", () => {
  it("should lead with the install link and keep the by-hand path when showing Claude Desktop", () => {
    const short = renderToStaticMarkup(<ClaudeDesktopGuide origin={origin} />);
    expect(short).toContain(`href="${claudeLink}"`);
    expect(short).not.toContain("no one-click link");
    for (const step of ["Add custom connector", `<code>${endpoint}</code>`, "<code>artifacts.space</code>", "published identity"]) {
      expect(short).toContain(step);
    }
    expect(short).not.toContain("admin-settings");
    const full = renderToStaticMarkup(<ClaudeDesktopGuide origin={origin} full />);
    expect(full).toContain('href="https://claude.ai/admin-settings/connectors?modal=add-custom-connector&amp;connectorName=artifacts.space&amp;connectorUrl=https%3A%2F%2Fartifacts.space%2Fapi%2Fmcp"');
    expect(full).toContain("Nothing is added until you confirm in Claude.");
  });

  it("should open Codex's settings and say that no link adds a server when showing Codex", () => {
    const guide = renderToStaticMarkup(<CodexGuide origin={origin} />);
    expect(guide).toContain('href="codex://settings"');
    expect(guide).toContain("If you have the ChatGPT desktop app, this opens its Settings. Codex has no link that adds a server.");
    for (const step of [`codex mcp add artifacts --url ${endpoint}`, "MCP servers", "Streamable HTTP", "Authenticate"]) {
      expect(guide).toContain(step);
    }
  });

  it("should give the desktop steps and the message for a Bot when showing Grok Bot", () => {
    const guide = renderToStaticMarkup(<GrokBotGuide origin={origin} />);
    for (const step of ["no one-click link for Grok Bot", "Connect apps", "Add a custom connector", "Remote HTTPS", `<code>${endpoint}</code>`, "Add plugin", "Needs auth", `Add the MCP server at ${endpoint} and name it artifacts.`]) {
      expect(guide).toContain(step);
    }
    expect(guide).not.toContain("grok.com/connectors");
    expect(renderToStaticMarkup(<GrokBotGuide origin={origin} full />)).toContain('href="https://grok.com/connectors"');
  });
});
