import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMAIL_FONT_STACK, emailLink, emailLogoUrl, escapeHtml, html, renderEmail } from "./layout";

const content = () => ({
  title: "Title",
  preview: "Preview <line>",
  heading: html`Sign in to artifacts.space`,
  paragraphs: [html`Hello ${"<b>Ann</b>"}`],
  action: { label: "Open", url: "https://artifacts.space/x?a=1&b=2" },
  reason: "You got this because of artifacts.space.",
  text: "Body https://artifacts.space/x",
});

describe("email layout", () => {
  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_URL", "https://artifacts.space");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should set Geist first with system fallbacks when rendering text", () => {
    const rendered = renderEmail(content()).html;
    expect(EMAIL_FONT_STACK.startsWith("Geist,")).toBe(true);
    expect(EMAIL_FONT_STACK).toContain("system-ui");
    expect(EMAIL_FONT_STACK).not.toContain('"');
    expect(rendered).toContain(`font-family:${EMAIL_FONT_STACK};`);
    expect(rendered).not.toContain("Satoshi");
  });

  it("should escape every interpolated string when building html", () => {
    expect(html`Hi ${`"><script>alert(1)</script>`}`.safeHtml).toBe("Hi &quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("should insert SafeHtml values as they are when building html", () => {
    expect(html`See ${emailLink("https://artifacts.space/a", "A & B")}`.safeHtml).toContain('href="https://artifacts.space/a"');
    expect(html`See ${emailLink("https://artifacts.space/a", "A & B")}`.safeHtml).toContain(">A &amp; B</a>");
  });

  it("should turn the site name in template copy into a quiet link when building html", () => {
    const heading = html`Sign in to artifacts.space`.safeHtml;
    expect(heading).toMatch(/^Sign in to <a href="https:\/\/artifacts\.space\/"[^>]*text-decoration:none[^>]*>artifacts\.space<\/a>$/);
  });

  it("should leave email addresses and longer domains alone when linking the site name", () => {
    expect(html`Mail noreply@artifacts.space or docs.artifacts.space.example`.safeHtml).not.toContain("<a");
  });

  it("should escape single quotes too when escaping html", () => {
    expect(escapeHtml(`a'b`)).toBe("a&#39;b");
  });

  it("should build the logo URL on the site origin when one is configured", () => {
    expect(emailLogoUrl()).toBe("https://artifacts.space/email/artifacts-space-icon.png");
  });

  it("should render the logo, card, button, and footer when rendering an email", () => {
    const { html: out } = renderEmail(content());
    expect(out).toContain('<img src="https://artifacts.space/email/artifacts-space-icon.png" width="48" height="48" alt="artifacts.space"');
    expect(out).toContain("max-width:520px");
    expect(out).toContain('href="https://artifacts.space/x?a=1&amp;b=2"');
    expect(out).toContain("Hello &lt;b&gt;Ann&lt;/b&gt;");
    expect(out).toContain("Preview &lt;line&gt;");
    expect(out).toContain("prefers-color-scheme:dark");
  });

  it("should add the reason and site link to the plain text when rendering an email", () => {
    const { text } = renderEmail(content());
    expect(text).toBe("Body https://artifacts.space/x\n\n--\nYou got this because of artifacts.space.\nartifacts.space: https://artifacts.space/");
  });
});
