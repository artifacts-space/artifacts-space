import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactView } from "./artifact-view";
import { MarkdownDiagramBody } from "./markdown-mermaid";
import { MarkdownView } from "./markdown-view";
import { ThemeScope } from "./theme-scope";

const flowchart = "flowchart TD\n  A[Start] --> B[Ship]";
const document = `# Plan\n\n\`\`\`mermaid\n${flowchart}\n\`\`\`\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n`;

const voidElements = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Where the first element in `html` closes: its matching end tag, by counting tags (static markup is well formed). */
function firstElementEnd(html: string): number {
  let depth = 0;
  for (const match of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)[^>]*?(\/?)>/gu)) {
    const [tag, closing, name = "", selfClosing] = match;
    if (voidElements.has(name) || selfClosing) continue;
    depth += closing ? -1 : 1;
    if (depth === 0) return match.index + tag.length;
  }
  return html.length;
}

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
    const html = renderToStaticMarkup(<><ThemeScope mode="dark"><ArtifactView kind="markdown" content={document} /></ThemeScope><div data-after-scope="" /></>);
    // The diagram reads its colors from the tokens in scope at its own element, so it must sit inside the dark scope.
    expect(html).toMatch(/^<div[^>]*class="[^"]*\bdark\b/u);
    const scopeEnd = firstElementEnd(html);
    const diagram = html.indexOf("data-markdown-diagram");
    expect(diagram).toBeGreaterThan(0);
    expect(diagram).toBeLessThan(scopeEnd);
    expect(html.indexOf("data-after-scope")).toBeGreaterThan(scopeEnd);
  });
});

describe("MarkdownDiagramBody", () => {
  it("should show the drawn diagram only as an image when Mermaid succeeds", () => {
    const html = renderToStaticMarkup(<MarkdownDiagramBody code={flowchart} state={{ status: "drawn", diagram: { svg: drawnSvg, width: 120, height: 40, smallestFont: 14 } }} />);
    expect(html).toContain('src="data:image/svg+xml');
    // The diagram's own SVG is never inlined (the only inline SVG is the zoom button's icon).
    expect(html).not.toContain('viewBox="0 0 120 40"');
    expect(html).not.toContain("<text");
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

/** A document with one mermaid fence whose info string is `info`. */
const fenced = (info: string) => `\`\`\`${info}\n${flowchart}\n\`\`\`\n`;

describe("Mermaid views in the Markdown read view", () => {
  it.each(["mermaid", "mermaid {view=preview}", "mermaid {view=sideways}"])("should show only the diagram when the fence is %s", (info) => {
    const html = renderToStaticMarkup(<ArtifactView kind="markdown" content={fenced(info)} />);
    expect(html).toContain('data-diagram-view="preview"');
    expect(html).toContain("data-markdown-diagram");
    expect(html).not.toContain("data-code-block");
  });

  it("should show only the source as a code block, and never start drawing, when the view is code", () => {
    const html = renderToStaticMarkup(<ArtifactView kind="markdown" content={fenced("mermaid {view=code}")} />);
    expect(html).toContain('data-diagram-view="code"');
    expect(html).toContain("data-code-block");
    expect(html).toContain("flowchart TD");
    expect(html).not.toContain("data-markdown-diagram");
    expect(html).not.toContain("Drawing diagram…");
  });

  it("should show the source and the diagram together, with the source only once, when the view is split", () => {
    const html = renderToStaticMarkup(<ArtifactView kind="markdown" content={fenced("mermaid {view=split}")} />);
    expect(html).toContain('data-diagram-view="split"');
    expect(html).toContain("data-diagram-split");
    expect(html.match(/data-code-block/g)).toHaveLength(1);
    expect(html).toContain("Drawing diagram…");
    // The code block beside the diagram already gives screen readers the source.
    expect(html).not.toContain("Diagram source, in Mermaid:");
    // Side by side only when the block is wide: it stacks in a narrow column.
    expect(html).toMatch(/class="[^"]*@container/u);
    expect(html).toMatch(/class="[^"]*@xl:grid-cols-2/u);
  });

  it("should show the caption below the diagram, with escaped quotes read as written", () => {
    const html = renderToStaticMarkup(<ArtifactView kind="markdown" content={fenced('mermaid {view=split caption="Say \\"ship\\" now"}')} />);
    expect(html).toMatch(/<figcaption[^>]*>Say &quot;ship&quot; now<\/figcaption><\/figure>/u);
  });

  it("should show the caption and wrap long lines when a plain code block asks for them", () => {
    const html = renderToStaticMarkup(<ArtifactView kind="markdown" content={'```ts {wrap=true caption="The answer"}\nconst x = 1;\n```\n'} />);
    expect(html).toContain("data-code-figure");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toMatch(/<figcaption[^>]*>The answer<\/figcaption>/u);
  });

  it("should read the attributes as written when the fence sits in a quote or uses Windows line endings", () => {
    const quoted = renderToStaticMarkup(<ArtifactView kind="markdown" content={'> ```mermaid {view=code caption="Quoted"}\n> graph LR\n>   A --> B\n> ```\n'} />);
    expect(quoted).toContain('data-diagram-view="code"');
    expect(quoted).toMatch(/<figcaption[^>]*>Quoted<\/figcaption>/u);
    const crlf = renderToStaticMarkup(<ArtifactView kind="markdown" content={"```mermaid {view=split}\r\ngraph LR\r\n  A --> B\r\n```\r\n"} />);
    expect(crlf).toContain('data-diagram-view="split"');
  });

  it("should keep a code block without attributes as it was", () => {
    const html = renderToStaticMarkup(<ArtifactView kind="markdown" content={"```ts\nconst x = 1;\n```\n"} />);
    expect(html).not.toContain("data-code-figure");
    expect(html).not.toContain("whitespace-pre-wrap");
  });

  it("should offer zoom on a drawn diagram in a document", () => {
    const html = renderToStaticMarkup(<MarkdownDiagramBody code={flowchart} state={{ status: "drawn", diagram: { svg: drawnSvg, width: 120, height: 40, smallestFont: 14 } }} />);
    expect(html).toContain('aria-label="Zoom in"');
    expect(html).toContain("cursor-zoom-in");
  });
});
