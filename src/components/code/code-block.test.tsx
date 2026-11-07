import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CodeBlock } from "./code-block";

describe("CodeBlock", () => {
  it("should show the language in the header when a language is set", () => {
    const html = renderToStaticMarkup(<CodeBlock code="const x = 1;" language="typescript" />);
    expect(html).toContain(">typescript</span>");
  });

  it("should offer an accessible copy button when it renders", () => {
    const html = renderToStaticMarkup(<CodeBlock code="const x = 1;" language="ts" />);
    expect(html).toContain('aria-label="Copy code"');
  });

  it("should color tokens with syntax token classes when lines come highlighted", () => {
    const html = renderToStaticMarkup(
      <CodeBlock code="return 1" language="ts" lines={[[{ text: "return", kind: "keyword" }, { text: " ", kind: null }, { text: "1", kind: "number" }]]} />,
    );
    expect(html).toContain('<span class="text-syntax-keyword">return</span>');
    expect(html).toContain('<span class="text-syntax-number">1</span>');
  });

  it("should show the code as plain text when no highlighted lines are given", () => {
    const html = renderToStaticMarkup(<CodeBlock code={"a < b\n"} language="klingon" />);
    expect(html).toContain("a &lt; b</code>");
    expect(html).not.toContain("text-syntax-");
  });
});

describe("CodeBlock with a title", () => {
  it("should keep the title left and put the language beside the copy button when a title is set", () => {
    const code = "npx skills add https://github.com/caldoai/skills --skill untangle-codebase";
    const html = renderToStaticMarkup(<CodeBlock code={code} language="bash" title="Install the skill" />);
    const title = html.indexOf("Install the skill");
    const language = html.indexOf(">bash</span>");
    const copy = html.indexOf('aria-label="Copy code"');
    expect(title).toBeGreaterThan(-1);
    expect(language).toBeGreaterThan(title);
    expect(copy).toBeGreaterThan(language);
  });
});
