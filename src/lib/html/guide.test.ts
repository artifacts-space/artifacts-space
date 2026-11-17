import { describe, expect, it } from "vitest";

import { validateArtifactContent } from "@/lib/artifact-content";
import { fileLimits, formatBytes } from "@/lib/files/config";
import { artifactSizeLimits } from "@/lib/artifact-limits";
import { pageBatchLimits } from "@/lib/page-files/publish-rules";
import { pageFileLimits, pageFileTypesHint, pagePathProblem } from "@/lib/page-files/rules";
import { pageTokenLimits } from "@/lib/page-files/token";
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

  it("should lead with the flow that puts many files in with few calls, and say it is all or nothing", () => {
    const section = guide.slice(guide.indexOf("Page files"), guide.indexOf("What goes in the document"));
    expect(section.indexOf("page_files_request_uploads")).toBeGreaterThan(0);
    expect(section.indexOf("page_files_request_uploads")).toBeLessThan(section.indexOf("files_request_upload with pagePath"));
    expect(section).toContain("page_files_publish once with all the fileIds");
    expect(section).toContain(`up to ${String(pageBatchLimits.maxUploadsPerRequest)} in a call`);
    expect(section).toContain(`up to ${String(pageBatchLimits.maxFilesPerPublish)}`);
    expect(section).toContain("or not at all");
    expect(section).toContain("each path in remove is deleted");
  });

  it("should say when weight belongs in files, with the document's limit from its constant", () => {
    const section = guide.slice(guide.indexOf("What goes in the document"), guide.indexOf("A page that stays open"));
    expect(section).toContain(`at most ${artifactSizeLimits.maxContentBytes.toLocaleString("en-US")} bytes`);
    expect(section).toContain("Put in page files");
  });

  it("should state what still fails after a page's first address ended, and the way around it", () => {
    const section = guide.slice(guide.indexOf("A page that stays open"), guide.indexOf("What the page cannot do"));
    expect(section).toContain("a module that already loaded keeps the address it loaded from");
    expect(section).toContain('import(new URL("js/chart.js", document.baseURI))');
    expect(section).toContain("hidden");
    // The life it names is the token's own.
    expect(section).toContain(`${String((pageTokenLimits.lifeSeconds - pageTokenLimits.stepSeconds) / 60)} to ${String(pageTokenLimits.lifeSeconds / 60)} minutes`);
    expect(guide).not.toContain("until the reader loads the page again.\n- Readers");
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
