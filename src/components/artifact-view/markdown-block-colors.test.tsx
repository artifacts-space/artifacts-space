import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactView } from "./artifact-view";
import { MarkdownView } from "./markdown-view";

function render(content: string) {
  return renderToStaticMarkup(<ArtifactView kind="markdown" content={content} title="Plan" files={[]} />);
}

describe("block colors in the read view", () => {
  it("should color a paragraph and drop the color comment when it ends the text", () => {
    const html = render("Read this first <!-- color: red; background: yellow -->\n");
    expect(html).toContain('<p data-block-color="red" data-block-background="yellow">Read this first</p>');
    expect(html).not.toContain("<!--");
  });

  it("should color headings and quoted lines when they end in a color comment", () => {
    const html = render("## Status <!-- background: green -->\n\n> Quoted <!-- color: pink -->\n");
    expect(html).toMatch(/<h2[^>]*data-block-background="green"[^>]*>Status<\/h2>/);
    expect(html).toContain('<p data-block-color="pink">Quoted</p>');
  });

  it("should color only the item's own line in a tight list, task items included", () => {
    const html = render("- one <!-- color: blue -->\n  - nested\n- two\n\nTasks:\n\n- [ ] call back <!-- background: purple -->\n");
    expect(html).toContain('<span data-block-color="blue">one</span>');
    expect(html).toMatch(/<li>nested<\/li>/);
    expect(html).toMatch(/<input[^>]*> <span data-block-background="purple">call back<\/span>/);
  });

  it("should color the paragraph itself in a loose list", () => {
    const html = render("- one <!-- color: blue -->\n\n- two\n");
    expect(html).toContain('<p data-block-color="blue">one</p>');
  });

  it("should ignore hues that do not exist and leave other comments hidden", () => {
    const html = render("Teal <!-- color: teal -->\n\nNote <!-- TODO: check -->\n");
    expect(html).toContain("<p>Teal</p>");
    expect(html).not.toContain("data-block-color");
    expect(html).not.toContain("TODO");
  });

  it("should color comments drawn without media too", () => {
    const html = renderToStaticMarkup(<MarkdownView content={"Heads up <!-- color: orange -->"} />);
    expect(html).toContain('<p data-block-color="orange">Heads up</p>');
  });
});
