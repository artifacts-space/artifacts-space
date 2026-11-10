import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FileDto } from "@/lib/files/types";

import { ArtifactView } from "./artifact-view";
import { MarkdownView } from "./markdown-view";

const image = "0f8fad5b-d9cb-469f-a165-70867728950e";
const video = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const report = "9b2a4f43-6a7b-4a2e-8f61-3c1a9d2e7b10";
const files: FileDto[] = [
  { id: image, filename: "chart.png", contentType: "image/png", size: 1200, createdAt: "2026-11-10T00:00:00.000Z" },
  { id: video, filename: "demo.mp4", contentType: "video/mp4", size: 9_000_000, createdAt: "2026-11-10T00:00:00.000Z" },
  { id: report, filename: "q3.pdf", contentType: "application/pdf", size: 400_000, createdAt: "2026-11-10T00:00:00.000Z" },
];

function render(content: string, list: FileDto[] | undefined = files) {
  return renderToStaticMarkup(<ArtifactView kind="markdown" content={content} title="Plan" files={list} />);
}

describe("Markdown media in the read view", () => {
  it("should show an uploaded image as a figure with its caption when it is alone in a paragraph", () => {
    const html = render(`Intro\n\n![Q3 chart](/api/files/${image}#width=50 "Revenue grew")\n`);
    expect(html).toContain(`src="/api/files/${image}"`);
    expect(html).toContain('alt="Q3 chart"');
    expect(html).toContain("<figcaption");
    expect(html).toContain("Revenue grew");
    expect(html).toContain("--media-width:50%");
    expect(html).not.toMatch(/<p>\s*<figure/);
  });

  it("should play a video and frame a PDF when the fragment names their kind", () => {
    const html = render(`![Demo](/api/files/${video}#video)\n\n![Report](/api/files/${report}#pdf)\n`);
    expect(html).toContain(`<video src="/api/files/${video}"`);
    expect(html).toContain(`<iframe src="/api/files/${report}"`);
    expect(html).toContain(`href="/api/files/${report}?download=1"`);
  });

  it("should show a download card when the kind is file", () => {
    const html = render(`![Q3 report](/api/files/${report}#file)\n`);
    expect(html).toContain("Q3 report");
    expect(html).toContain(`href="/api/files/${report}?download=1"`);
    expect(html).not.toContain("<iframe");
  });

  it("should request nothing when the reader's file list does not hold the file", () => {
    const html = render(`![Secret](/api/files/${image})\n`, files.slice(1));
    expect(html).not.toContain("<img");
    expect(html).not.toContain(`/api/files/${image}`);
    expect(html).toContain("is not available");
  });

  it("should still never load an image from another site", () => {
    const html = render("![pixel](https://example.com/p.gif)\n");
    expect(html).not.toContain("<img");
    expect(html).toContain("[Image: pixel]");
  });

  it("should keep links to uploads on this site and drop other relative links", () => {
    const html = render(`[the deck](/api/files/${report}?download=1) and [app](/app)`);
    expect(html).toContain(`href="/api/files/${report}?download=1"`);
    expect(html).not.toContain('href="/app"');
  });

  it("should not show uploaded media in comments, which use plain Markdown", () => {
    const html = renderToStaticMarkup(<MarkdownView content={`![Chart](/api/files/${image})`} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("[Image: Chart]");
  });
});
