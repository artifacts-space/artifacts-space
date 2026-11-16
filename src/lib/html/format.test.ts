import { describe, expect, it } from "vitest";

import { contentForSwitch, formatSwitchProblem } from "@/components/app/artifact-editor/format-choice-rules";
import { validateArtifactContent } from "@/lib/artifact-content";
import { detectFileText, detectTextKind, filePlan } from "@/lib/create/detect-kind-rules";
import { contentToMarkdown } from "@/lib/markdown/artifact-markdown";
import { artifactDescription } from "@/lib/og/description";
import { buildSynopsis } from "@/lib/og/synopsis";
import { hasWidthSetting, usesFullWidth } from "@/lib/page-width/rules";

import { htmlStarter } from "./rules";

const page = '<!doctype html><html lang="en"><head><title>Launch</title><style>p{color:red}</style></head><body><h1>Launch plan</h1><p>Ship on Friday.</p><script>alert(1)</script></body></html>';

describe("the html format on save", () => {
  it("should save a full page and refuse a fragment, with the reason", () => {
    expect(validateArtifactContent("html", page).valid).toBe(true);
    const refused = validateArtifactContent("html", "<h1>Launch plan</h1>");
    expect(refused.valid).toBe(false);
    expect(refused.issues[0]?.code).toBe("invalid_html");
    expect(refused.message).toContain("must start with <!doctype html>");
  });

  it("should refuse empty content", () => {
    expect(validateArtifactContent("html", "  ").valid).toBe(false);
  });
});

describe("switching a page to html", () => {
  it("should start an empty page with a small complete page, and keep anything written", () => {
    expect(contentForSwitch("html", "")).toBe(htmlStarter);
    expect(contentForSwitch("html", page)).toBe(page);
    expect(formatSwitchProblem("html", contentForSwitch("html", ""))).toBeNull();
  });

  it("should say why Markdown text cannot become a page", () => {
    expect(formatSwitchProblem("html", "# Notes")).toContain("can’t be HTML yet");
  });
});

describe("a dropped .html file", () => {
  it("should become an HTML artifact when it is a full page", () => {
    const plan = filePlan("Launch.html");
    if (!plan.read) throw new Error("an .html file is read as text");
    expect(detectFileText("Launch.html", page, plan)).toMatchObject({ kind: "html", title: "Launch" });
    expect(filePlan("page.HTM")).toMatchObject({ read: true, kind: "html" });
  });

  it("should stay code when it is a fragment or a template", () => {
    const plan = filePlan("partial.html");
    if (!plan.read) throw new Error("an .html file is read as text");
    expect(detectFileText("partial.html", "<div>{{ name }}</div>", plan)).toMatchObject({ kind: "code", language: "html" });
  });
});

describe("a full page pasted into an empty artifact", () => {
  it("should become an HTML artifact named by its own title", () => {
    expect(detectTextKind(page)).toMatchObject({ kind: "html", content: page, title: "Launch", reason: "html" });
    expect(detectTextKind(`\n  ${page}`)).toMatchObject({ kind: "html" });
  });

  it("should shorten a title longer than an artifact's title may be", () => {
    const long = `<!doctype html><html><head><title>${"Launch ".repeat(60)}</title></head><body></body></html>`;
    expect(detectTextKind(long).title?.length).toBeLessThanOrEqual(160);
  });

  it("should leave a fragment and prose that mentions a doctype as Markdown", () => {
    expect(detectTextKind("<h1>Launch plan</h1>\n<p>Ship on Friday.</p>").kind).toBe("markdown");
    expect(detectTextKind("Start every page with <!doctype html> so it draws in standards mode.").kind).toBe("markdown");
  });

  it("should still read an SVG with a doctype as an SVG", () => {
    const svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    expect(detectTextKind(svg).kind).toBe("svg");
  });
});

describe("an html artifact outside the page", () => {
  it("should give agents the source in the Markdown version", () => {
    const markdown = contentToMarkdown({ kind: "html", content: page, language: "", rawUrl: "https://artifacts.space/artifact/abc/raw", files: [] });
    expect(markdown.startsWith("```html\n<!doctype html>")).toBe(true);
  });

  it("should describe the page by its words in link previews, never by its markup or scripts", () => {
    const synopsis = buildSynopsis({ kind: "html", content: page, language: "", files: [] });
    expect(JSON.stringify(synopsis)).toContain("Launch plan");
    expect(JSON.stringify(synopsis)).not.toMatch(/alert|<h1|color:red/);
    const scriptOnly = buildSynopsis({ kind: "html", content: "<!doctype html><title>Orbit</title><body><canvas></canvas><script>draw()</script></body>", language: "", files: [] });
    expect(scriptOnly).toEqual({ type: "glyph", glyph: "page", label: "Web page", detail: "Orbit" });
  });

  it("should use the page's words as the description when it has no summary", () => {
    const description = artifactDescription({ kind: "html", summary: "", content: page, language: "", files: [] });
    expect(description).toContain("Launch plan Ship on Friday.");
    expect(description).not.toContain("alert");
  });

  it("should always use the whole width, with no Full width setting", () => {
    expect(usesFullWidth("html", false)).toBe(true);
    expect(hasWidthSetting("html")).toBe(false);
    expect(hasWidthSetting("markdown")).toBe(true);
    expect(usesFullWidth("csv", false)).toBe(true);
  });
});
