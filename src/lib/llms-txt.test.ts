import { describe, expect, it } from "vitest";

import { currentFormatKinds, earlierFormatKinds, formatInfo, formatKinds } from "@/lib/artifact-formats";
import { docsHref, docsPages, earlierFormatsSection } from "@/lib/docs/pages";

import { llmsTxtFor } from "./llms-txt";

const origin = "https://artifacts.example.com";
const text = llmsTxtFor(origin);
const lines = text.split("\n");
const linkLine = /^- \[([^\]]+)\]\((\S+)\): (.+)$/;

/** The link lines under one `## ` heading. */
function linksUnder(heading: string): { title: string; url: string; about: string }[] {
  const start = lines.indexOf(`## ${heading}`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? lines.length : end).flatMap((line) => {
    const match = linkLine.exec(line);
    return match?.[1] && match[2] && match[3] ? [{ title: match[1], url: match[2], about: match[3] }] : [];
  });
}

const headings = lines.filter((line) => line.startsWith("## ")).map((line) => line.slice(3));
const allLinks = headings.flatMap((heading) => linksUnder(heading));

describe("llmsTxtFor", () => {
  it("should open with one title and a quoted summary when a model reads it", () => {
    expect(lines[0]).toBe("# artifacts.space");
    expect(lines.filter((line) => line.startsWith("# "))).toHaveLength(1);
    expect(lines[2]).toMatch(/^> artifacts\.space is /);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("should end with the Optional section and hold only link lines under every heading", () => {
    expect(headings.at(-1)).toBe("Optional");
    const firstHeading = lines.findIndex((line) => line.startsWith("## "));
    for (const line of lines.slice(firstHeading)) expect(line === "" || line.startsWith("## ") || linkLine.test(line), line).toBe(true);
  });

  it("should list every docs page once, by its own title and description, when a page is added or removed", () => {
    const docsLinks = allLinks.filter((link) => new URL(link.url).pathname.startsWith("/docs"));
    expect(docsLinks.map((link) => link.url).sort()).toEqual(docsPages.map((page) => `${origin}${docsHref(page.slug)}`).sort());
    for (const page of docsPages) {
      const link = docsLinks.find((item) => item.url === `${origin}${docsHref(page.slug)}`);
      expect(link?.title, page.slug).toBe(page.title);
      expect(link?.about, page.slug).toBe(page.description);
    }
  });

  it("should put the earlier formats' docs under Optional and nowhere else", () => {
    const earlier = docsPages.filter((page) => page.section === earlierFormatsSection).map((page) => `${origin}${docsHref(page.slug)}`);
    expect(earlier.length).toBeGreaterThan(0);
    const optional = linksUnder("Optional").map((link) => link.url);
    for (const url of earlier) expect(optional, url).toContain(url);
    expect(text.slice(0, text.indexOf("## Optional"))).not.toContain("json-render");
    for (const page of docsPages) if (page.slug.startsWith("json-render")) expect(page.section, page.slug).toBe(earlierFormatsSection);
  });

  it("should name every current format with its own helper line, and the earlier ones only as earlier formats", () => {
    expect([...currentFormatKinds, ...earlierFormatKinds].sort()).toEqual([...formatKinds].sort());
    for (const kind of currentFormatKinds) expect(lines, kind).toContain(`- \`${kind}\`: ${formatInfo[kind].helper}`);
    for (const kind of earlierFormatKinds) expect(lines.some((line) => line.startsWith(`- \`${kind}\``)), kind).toBe(false);
    expect(text).toContain("`ui` and `canvas` are earlier formats, kept for the artifacts that use them.");
    expect(text.indexOf("Use `html` for anything visual or interactive")).toBeGreaterThan(-1);
  });

  it("should point at this site alone when it is served from another origin", () => {
    expect(text).toContain(`Agents connect over MCP at ${origin}/api/mcp.`);
    for (const link of allLinks) {
      const url = new URL(link.url);
      expect(url.protocol, link.url).toBe("https:");
      if (url.hostname !== "github.com") expect(url.origin, link.url).toBe(origin);
    }
    expect(llmsTxtFor("http://localhost:3000")).not.toContain("artifacts.example.com");
  });

  it("should never name a private route when it lists the site", () => {
    for (const link of allLinks) expect(new URL(link.url).pathname, link.url).not.toMatch(/^\/(app|api|artifact|teams|inbox|sign-in|dev)(\/|$)/);
  });
});
