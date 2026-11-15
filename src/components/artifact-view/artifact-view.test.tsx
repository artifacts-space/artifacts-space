import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FileDto } from "@/lib/files/types";
import { componentFixtures, fixtureFiles, fixtureSpec } from "@/lib/ui/fixtures/components";
import { exampleUiSpec } from "@/lib/ui/fixtures/example";
import { invalidPropsSpec, unknownTypeSpec } from "@/lib/ui/fixtures/specs";
import { uiComponentNames } from "@/lib/ui/catalog";

import { appFlowCanvas, brokenFrameCanvas, emptyCanvas } from "@/lib/canvas/fixtures";

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

  it("should render a csv as a grid with sortable headers and a row count", () => {
    const html = render("csv", "name,score\nAda,10\nLin,9\n");
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain("Showing 2 of 2 rows");
    expect(html).toContain("Filter rows in every column");
  });

  it("should pretty-print json in a code block labelled json when it parses", () => {
    const html = render("json", '{"service":"billing","p95Ms":182}');
    expect(html).toContain("data-code-block");
    expect(html).toContain(">json</span>");
    expect(html).toContain("{\n  &quot;service&quot;: &quot;billing&quot;,\n  &quot;p95Ms&quot;: 182\n}");
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
      { id: "00000000-0000-4000-8000-00000000000a", filename: "demo.mp4", contentType: "video/mp4", size: 10, createdAt: "2026-11-05T00:00:00.000Z", replacedAt: null },
      { id: "00000000-0000-4000-8000-00000000000b", filename: "note.mp3", contentType: "audio/mpeg", size: 10, createdAt: "2026-11-05T00:00:00.000Z", replacedAt: null },
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

describe("ArtifactView for markdown code and text", () => {
  it("should render fenced code as the shared code block when markdown has a fence", () => {
    const html = render("markdown", "Intro\n\n```ts\nconst x = 1;\n```");
    expect(html).toContain("data-code-block");
    expect(html).toContain(">ts</span>");
    expect(html).toContain("const x = 1;");
  });

  it("should keep every line of a text artifact when it renders", () => {
    const html = render("text", "Standup notes, 6 Nov\nShipped: docs shell\nNext: MCP reference");
    expect(html).toContain("<article");
    expect(html).toContain("Standup notes, 6 Nov\nShipped: docs shell\nNext: MCP reference");
  });

  it("should render every block of the markdown sample when it renders", () => {
    const html = render("markdown", "# Billing migration plan\n\n- [x] Dual-write behind `billing.ledger_v2`\n- [ ] Backfill 2025 invoices\n\n| Step | Owner |\n| --- | --- |\n| Backfill | @dana |");
    expect(html).toContain("<h1>Billing migration plan</h1>");
    expect(html).toContain("<code>billing.ledger_v2</code>");
    expect(html).toContain("Backfill 2025 invoices");
    expect(html).toContain("<td>@dana</td>");
  });
});

describe("ArtifactView for canvas", () => {
  it("should server-render every frame's name, size, and interface when the canvas is valid", () => {
    const html = render("canvas", JSON.stringify(appFlowCanvas));
    for (const name of ["1. Sign in", "2. Inbox", "3. Ticket", "4. Settings"]) expect(html).toContain(name);
    expect(html).toContain("390 × 844");
    expect(html).toContain("Welcome back");
    expect(html).toContain('aria-label="Canvas, 4 frames"');
    expect(html.match(/data-canvas-frame="/g)).toHaveLength(4);
  });

  it("should show a notice in place of a frame that cannot be shown and still render the others", () => {
    const html = render("canvas", JSON.stringify(brokenFrameCanvas));
    expect(html).toContain("Welcome back");
    expect(html).toContain("This frame could not be shown.");
    expect(html).toContain("&quot;width&quot; must be a whole number from 240 to 2560");
    expect(html).toContain("This interface could not be shown.");
  });

  it("should say so when a canvas has no frames", () => {
    expect(render("canvas", JSON.stringify(emptyCanvas))).toContain("This canvas has no frames yet.");
  });

  it("should show the issues instead of a board when the canvas cannot be read", () => {
    const html = render("canvas", '{ "version": 1, "frames": "none" }');
    expect(html).toContain("This canvas could not be shown.");
    expect(html).toContain("&quot;frames&quot; must be a list of frames");
    expect(html).not.toContain("data-canvas-board");
  });

  it("should show a notice, not fail, when a frame's spec nests far too deep to draw", () => {
    // A runtime that cannot write the nesting out shows the frame's notice; one that can hands it to the interface renderer, which refuses it. Either way a notice, never a throw.
    const depth = 20_000;
    const deep = `${'{"a":'.repeat(depth)}1${"}".repeat(depth)}`;
    const html = render("canvas", `{"version":1,"frames":[{"id":"home","name":"Home","width":390,"spec":${deep}}]}`);
    expect(html).toMatch(/This (frame|interface) could not be shown\./);
  });

  it("should show the interface's own notice when a frame's spec nests deeper than the limit", () => {
    const depth = 1_000;
    const deep = `${'{"a":'.repeat(depth)}1${"}".repeat(depth)}`;
    const html = render("canvas", `{"version":1,"frames":[{"id":"home","name":"Home","width":390,"spec":${deep}}]}`);
    expect(html).toContain("This interface could not be shown.");
    expect(html).toContain("nests JSON more than 64 levels deep");
  });

  it("should never render markup from a frame's text", () => {
    const spec = { version: 1, root: "t", elements: { t: { type: "Text", props: { text: "<script>alert(1)</script>" } } } };
    const html = render("canvas", JSON.stringify({ version: 1, frames: [{ id: "a", name: "<img src=x onerror=alert(1)>", width: 390, spec }] }));
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
  });
});
