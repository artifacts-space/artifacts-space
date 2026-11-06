import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FileDto } from "@/lib/files/types";
import { componentFixtures, fixtureFiles, fixtureSpec } from "@/lib/ui/fixtures/components";
import { exampleUiSpec } from "@/lib/ui/fixtures/example";
import { invalidPropsSpec, unknownTypeSpec } from "@/lib/ui/fixtures/specs";
import { uiComponentNames } from "@/lib/ui/catalog";

import { ArtifactView } from "./artifact-view";

function render(kind: string, content: string) {
  return renderToStaticMarkup(<ArtifactView kind={kind} content={content} title="Test" />);
}

describe("ArtifactView for markdown", () => {
  it("should drop raw HTML and unsafe links when rendering", () => {
    const html = render("markdown", "<script>alert(1)</script>\n\n[x](javascript:alert(1)) [ok](https://example.com)");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(html).toContain('target="_blank"');
  });

  it("should show images as text instead of loading them", () => {
    expect(render("markdown", "![pixel](https://example.com/p.gif)")).not.toContain("<img");
  });
});

describe("ArtifactView for svg", () => {
  it("should show svg only through an image data URI", () => {
    const html = render("svg", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(html).toContain('src="data:image/svg+xml');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<svg");
  });
});

describe("ArtifactView for csv and json", () => {
  it("should cut rows and say so when a csv is long", () => {
    const content = ["n", ...Array.from({ length: 1200 }, (_, index) => String(index))].join("\n");
    expect(render("csv", content)).toContain("Showing the first 1,000 of 1,200 rows.");
  });

  it("should show invalid json as written with a notice", () => {
    const html = render("json", "{ nope");
    expect(html).toContain("does not parse");
    expect(html).toContain("{ nope");
  });
});

describe("ArtifactView for ui", () => {
  it("should render the example spec on the server", () => {
    const html = render("ui", JSON.stringify(exampleUiSpec));
    expect(html).toContain("Release 2.4 readiness");
    expect(html).toContain("98.6%");
  });

  it.each(uiComponentNames.flatMap((type) => componentFixtures[type].map((fixture) => [type, fixture.name, fixture] as const)))(
    "should render the %s fixture %j without throwing",
    (type, _name, fixture) => {
      const html = render("ui", JSON.stringify(fixtureSpec(type, fixture)));
      expect(html).not.toContain("could not be shown");
    },
  );

  it("should render nothing for an unknown type and keep its neighbours", () => {
    const html = render("ui", JSON.stringify(unknownTypeSpec));
    expect(html).toContain("This text still renders after it.");
    // The unknown element itself renders nothing; only the issue list names it.
    expect(html.split("Hologram")).toHaveLength(2);
    expect(html).not.toContain("intensity");
  });

  it("should show an inline notice for an element with invalid props", () => {
    const html = render("ui", JSON.stringify(invalidPropsSpec));
    expect(html).toContain("This Chart could not be shown.");
    expect(html).toContain("still here");
  });

  it("should list the issues when the spec cannot render", () => {
    expect(render("ui", "{")).toContain("This interface could not be shown.");
  });
});

describe("ArtifactView for empty content", () => {
  it("should say the artifact is empty when content is blank", () => {
    expect(render("markdown", "  ")).toContain("This artifact is empty.");
  });
});

describe("ArtifactView for files", () => {
  const [image, pdf, docx] = fixtureFiles;
  const renderFiles = (content: string, files: FileDto[] = [...fixtureFiles]) => renderToStaticMarkup(<ArtifactView kind="file" content={content} title="Files" files={files} />);

  it("should show images inline, pdfs in a frame, and others as download cards", () => {
    const html = renderFiles("Read **this** first.");
    expect(html).toContain("<strong>this</strong>");
    expect(html).toContain(`<img src="/api/files/${image.id}"`);
    expect(html).toContain(`<iframe src="/api/files/${pdf.id}"`);
    expect(html).toContain(`href="/api/files/${docx.id}?download=1"`);
    expect(html).toContain("Word document · 25 MB");
  });

  it("should play video and audio in native players", () => {
    const media = [
      { id: "00000000-0000-4000-8000-00000000000a", filename: "demo.mp4", contentType: "video/mp4", size: 10, createdAt: "2026-11-05T00:00:00.000Z" },
      { id: "00000000-0000-4000-8000-00000000000b", filename: "note.mp3", contentType: "audio/mpeg", size: 10, createdAt: "2026-11-05T00:00:00.000Z" },
    ];
    const html = renderFiles("", media);
    expect(html).toContain("<video");
    expect(html).toContain("<audio");
  });

  it("should say so when a file artifact has no files yet", () => {
    expect(renderFiles("", [])).toContain("No files yet.");
  });

  it("should show an uploaded image by id and refuse ids the artifact does not hold", () => {
    const spec = { version: 1, root: "s", elements: { s: { type: "Stack", props: {}, children: ["i", "x"] }, i: { type: "Image", props: { file: image.id, alt: "Diagram" } }, x: { type: "File", props: { file: "00000000-0000-4000-8000-0000000000ff" } } } };
    const html = renderToStaticMarkup(<ArtifactView kind="ui" content={JSON.stringify(spec)} files={[...fixtureFiles]} />);
    expect(html).toContain(`src="/api/files/${image.id}"`);
    expect(html).toContain('alt="Diagram"');
    expect(html).toContain("Its file is not attached to this artifact.");
  });
});
