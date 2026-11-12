import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ClaudeDesktopGuide } from "@/components/setup/client-guides";
import { CodexGuide, GrokBotGuide } from "@/components/setup/codex-grok-guides";
import { desktopApps } from "@/lib/setup/client-installs";

import { DesktopAppInstalls } from "./desktop-app-installs";

const origin = "https://artifacts.space";
const endpoint = "https://artifacts.space/api/mcp";
const claudeLink = "https://claude.ai/customize/connectors?modal=add-custom-connector&amp;connectorName=artifacts.space&amp;connectorUrl=https%3A%2F%2Fartifacts.space%2Fapi%2Fmcp";

/** Each button's markup, in the order the row shows them. */
function buttons(html: string): string[] {
  return html.match(/<(a|button)[^>]*data-install="[^"]+"[^>]*>.*?<\/\1>/g) ?? [];
}

/** A button's visible label: the text right after its logo, up to the next tag. */
function label(button: string): string | undefined {
  return /<\/svg>([^<]*)</.exec(button)?.[1];
}

describe("DesktopAppInstalls", () => {
  const html = renderToStaticMarkup(<DesktopAppInstalls origin={origin} apps={desktopApps} />);

  it("should show one button per app, in order, each with the app's mark before its label when the row renders", () => {
    const row = buttons(html);
    expect(row.map((button) => /data-install="([^"]+)"/.exec(button)?.[1])).toEqual(["cursor", "claude-desktop", "codex", "grok-bot"]);
    expect(row.map(label)).toEqual(["Add to Cursor", "Add to Claude Desktop", "Add to Codex", "Add to Grok Bot"]);
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
    expect(claude).toContain('<span class="sr-only"> (opens in a new tab)</span>');
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

  it("should open Codex's settings without repeating that no link adds a server when showing Codex", () => {
    const guide = renderToStaticMarkup(<CodexGuide origin={origin} />);
    expect(guide).toContain('href="codex://settings"');
    expect(guide).toContain("If you have the ChatGPT desktop app, this opens its Settings.");
    expect(guide).not.toContain("Codex has no link that adds a server.");
    for (const step of ["no one-click link for Codex", `codex mcp add artifacts --url ${endpoint}`, "MCP servers", "Streamable HTTP", "Authenticate"]) {
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

  it("should leave out the no-link line and keep the steps when the dialog shows the guide", () => {
    for (const Guide of [CodexGuide, GrokBotGuide]) {
      const guide = renderToStaticMarkup(<Guide origin={origin} hideNoOneClick />);
      expect(guide).not.toContain("no one-click link");
      expect(guide).toContain(endpoint);
    }
  });
});

describe("check the connection", () => {
  /** The guide's markup from its "Check the connection" label on. */
  function checkStep(html: string): string {
    const start = html.indexOf("Check the connection");
    expect(start, "the guide has a check step").toBeGreaterThan(-1);
    return html.slice(start);
  }

  it("should list the servers with codex mcp list and say where the desktop app asks to sign in when checking Codex", () => {
    const step = checkStep(renderToStaticMarkup(<CodexGuide origin={origin} />));
    expect(step).toContain("codex mcp list");
    expect(step).toContain("<strong>Authenticate</strong>");
  });

  it("should point to Installed in Connect apps and say what each status means when checking Grok Bot", () => {
    const step = checkStep(renderToStaticMarkup(<GrokBotGuide origin={origin} />));
    for (const words of ["<strong>Installed</strong>", "<strong>Added</strong> means it is installed but not signed in yet", "<strong>Needs auth</strong> or <strong>Disconnected</strong>", "<strong>Authenticate</strong>"]) {
      expect(step).toContain(words);
    }
  });

  it("should point to Customize, then Connectors, and the + button in a chat when checking Claude", () => {
    const step = checkStep(renderToStaticMarkup(<ClaudeDesktopGuide origin={origin} />));
    for (const words of ["<strong>Customize</strong>, then <strong>Connectors</strong>", "<strong>artifacts.space</strong>", "<strong>+</strong> button"]) {
      expect(step).toContain(words);
    }
  });

  it("should draw no empty box when a check is text only", () => {
    for (const html of [renderToStaticMarkup(<GrokBotGuide origin={origin} />), renderToStaticMarkup(<ClaudeDesktopGuide origin={origin} />)]) {
      expect(checkStep(html)).not.toContain('<div class="mt-2"></div>');
    }
  });
});
