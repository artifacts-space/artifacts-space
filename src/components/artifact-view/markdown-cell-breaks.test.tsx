import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactView } from "./artifact-view";

function render(content: string) {
  return renderToStaticMarkup(<ArtifactView kind="markdown" content={content} title="Plan" files={[]} />);
}

describe("line breaks in table cells in the read view", () => {
  it("should draw a line break where a cell holds a br tag", () => {
    const html = render("| Step | Notes |\n| --- | --- |\n| 1 | First line<br>second line |\n| 2 | **a**<br/>b<BR />c |\n");
    expect(html).toMatch(/First line<br\/>\n?second line/);
    expect(html).toMatch(/<strong>a<\/strong><br\/>\n?b<br\/>\n?c/);
  });

  it("should still skip other HTML in a cell when it is not a line break", () => {
    const html = render("| a |\n| --- |\n| x<b>y</b><br class=\"z\">w |\n");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("class=\"z\"");
  });

  it("should leave a br tag outside a table skipped as raw HTML when it is in a paragraph", () => {
    expect(render("one<br>two\n")).toContain("<p>onetwo</p>");
  });
});
