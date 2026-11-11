import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactView } from "./artifact-view";
import { MarkdownDiagramBody } from "./markdown-mermaid";
import { MarkdownView } from "./markdown-view";
import { ThemeScope } from "./theme-scope";

const flowchart = "flowchart TD\n  A[Start] --> B[Ship]";
const document = `# Plan\n\n\`\`\`mermaid\n${flowchart}\n\`\`\`\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n`;

const drawnSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><text font-size="14">Start</text></svg>';

describe("Mermaid blocks in the Markdown read view", () => {
  it("should draw a diagram instead of a code block when a document has a mermaid fence", () => {
    const html = renderToStaticMarkup(<ArtifactView kind="markdown" content={document} title="Plan" />);
    expect(html).toContain("data-markdown-diagram");
    expect(html).toContain("Drawing diagram…");
    expect(html.match(/data-code-block/g)).toHaveLength(1);
  });

  it("should keep the code block when the Markdown is a comment", () => {
    const html = renderToStaticMarkup(<MarkdownView content={document} />);
    expect(html).not.toContain("data-markdown-diagram");
    expect(html).toContain("flowchart TD");
  });

  it("should draw a diagram when a file artifact's notes have a mermaid fence", () => {
    expect(renderToStaticMarkup(<ArtifactView kind="file" content={document} files={[]} />)).toContain("data-markdown-diagram");
  });

  it("should draw the diagram inside the theme scope when the artifact pins dark", () => {
    const html = renderToStaticMarkup(<ThemeScope mode="dark"><ArtifactView kind="markdown" content={document} /></ThemeScope>);
    // The diagram reads its colors from the tokens in scope at its own element, so it must sit inside the dark scope.
    expect(html).toMatch(/^<div[^>]*class="[^"]*\bdark\b[^"]*"[\s\S]*data-markdown-diagram/u);
  });
});

describe("MarkdownDiagramBody", () => {
  it("should show the drawn diagram only as an image when Mermaid succeeds", () => {
    const html = renderToStaticMarkup(<MarkdownDiagramBody code={flowchart} state={{ status: "drawn", diagram: { svg: drawnSvg, width: 120, height: 40, smallestFont: 14 } }} />);
    expect(html).toContain('src="data:image/svg+xml');
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("Couldn’t draw");
  });

  it("should give screen readers the diagram's source when it is drawn as an image", () => {
    const html = renderToStaticMarkup(<MarkdownDiagramBody code={flowchart} state={{ status: "drawn", diagram: { svg: drawnSvg, width: 120, height: 40, smallestFont: 14 } }} />);
    expect(html).toMatch(/<div class="sr-only"><p>Diagram source, in Mermaid:<\/p><pre>flowchart TD\n {2}A\[Start\] --&gt; B\[Ship\]<\/pre><\/div>/u);
    expect(html).not.toContain("data-code-block");
  });

  it("should show a placeholder, never an empty space, while the diagram draws", () => {
    const html = renderToStaticMarkup(<MarkdownDiagramBody code={flowchart} state={{ status: "drawing", diagram: null }} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Drawing diagram…");
  });

  it("should show the note and the source as a code block when the diagram cannot be drawn", () => {
    const html = renderToStaticMarkup(<MarkdownDiagramBody code={"flowchart TD\n  A -- > B"} state={{ status: "failed", reason: "Parse error on line 2:\n...A -- > B\n-----^" }} />);
    expect(html).toContain("Couldn’t draw this diagram.");
    expect(html).toContain("Parse error on line 2.");
    expect(html).toContain("data-code-block");
    expect(html).toContain("A -- &gt; B");
    expect(html).not.toContain("<img");
  });
});
