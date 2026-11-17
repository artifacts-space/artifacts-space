import { describe, expect, it } from "vitest";

import { validateArtifactContent } from "@/lib/artifact-content";
import { fileLimits, formatBytes } from "@/lib/files/config";
import { pageFileLimits, pageFileTypesHint, pagePathProblem } from "@/lib/page-files/rules";
import { pageContentPolicy, pageScriptHosts } from "@/lib/page-host/rules";

import { buildHtmlGuide } from "./guide";

const guide = buildHtmlGuide();

describe("buildHtmlGuide", () => {
  it("should name every host the page's policy lets scripts load from", () => {
    for (const host of pageScriptHosts) expect(guide).toContain(host.replace("https://", ""));
  });

  it("should name the font hosts only while the policy allows them", () => {
    const policy = pageContentPolicy("https://artifacts.space");
    expect(policy).toContain("https://fonts.googleapis.com");
    expect(policy).toContain("https://fonts.gstatic.com");
    expect(guide).toContain("fonts.googleapis.com");
    expect(guide).toContain("fonts.gstatic.com");
  });

  it("should tell agents how a page gets files of its own, with the limits the server enforces", () => {
    expect(guide).not.toContain("There are no separate files");
    expect(guide).toContain("files_request_upload with pagePath");
    expect(guide).toContain("files_attach");
    expect(guide).toContain("files_replace");
    expect(guide).toContain(pageFileTypesHint);
    expect(guide).toContain(`At most ${String(pageFileLimits.maxFiles)} page files and ${formatBytes(pageFileLimits.maxTotalBytes)} in all per artifact, and ${formatBytes(fileLimits.maxBytes)} per file.`);
    // Page files load only because the policy lets the page reach its own host.
    expect(pageContentPolicy("https://artifacts.space")).toContain("script-src 'self'");
  });

  it("should give only example paths the server accepts", () => {
    const section = guide.slice(guide.indexOf("Page files"), guide.indexOf("What the page cannot do"));
    const paths = [...section.matchAll(/(?:href|src)="([^"]+)"|import "\.\/([^"]+)"|fetch\("([^"]+)"\)|pagePath \(for example "([^"]+)"\)/g)].map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? "");
    expect(paths.length).toBeGreaterThanOrEqual(5);
    for (const path of paths) expect(pagePathProblem(path), path).toBeNull();
  });

  it("should end with an example that saves", () => {
    const example = guide.slice(guide.indexOf("<!doctype html>", guide.indexOf("Example")));
    expect(validateArtifactContent("html", example).valid).toBe(true);
  });

  it("should load nothing in its example that the policy refuses", () => {
    const example = guide.slice(guide.indexOf("Example"));
    expect(example).not.toMatch(/src=|href=|url\(|fetch\(/);
  });
});
