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

describe("CodeBlock as a command", () => {
  const command = "claude mcp add --transport http artifacts https://artifacts.space/api/mcp";

  it("should show a prompt that is hidden from screen readers and never selected when it is a command", () => {
    const html = renderToStaticMarkup(<CodeBlock variant="command" code={command} />);
    expect(html).toContain('<span aria-hidden="true" class="text-syntax-comment select-none">$ </span>');
  });

  it("should keep the prompt out of the code element when it is a command", () => {
    const html = renderToStaticMarkup(<CodeBlock variant="command" code={command} />);
    const code = /<code[^>]*>(.*?)<\/code>/.exec(html)?.[1] ?? "";
    expect(code).toBe(command);
    expect(code).not.toContain("$");
  });

  it("should drop the header and name the copy button for a command when no label is given", () => {
    const html = renderToStaticMarkup(<CodeBlock variant="command" code={command} />);
    expect(html).not.toContain("<figcaption");
    expect(html).toContain('aria-label="Copy command"');
    expect(html).toContain('data-variant="command"');
  });

  it("should use the given copy label when one is set", () => {
    const html = renderToStaticMarkup(<CodeBlock variant="command" code="npx skills add x" copyLabel="Copy skill command" />);
    expect(html).toContain('aria-label="Copy skill command"');
  });

  it("should color the command with syntax token classes when lines come highlighted", () => {
    const lines = [[{ text: "npx", kind: "function" as const }, { text: " skills", kind: null }]];
    const html = renderToStaticMarkup(<CodeBlock variant="command" code="npx skills" lines={lines} />);
    expect(html).toContain('<span class="text-syntax-function">npx</span>');
  });
});

describe("CodeBlock wrapping", () => {
  it("should wrap long lines instead of scrolling sideways when wrap is set", () => {
    const html = renderToStaticMarkup(<CodeBlock code="a very long report line" wrap />);
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).not.toContain("w-max");
  });

  it("should scroll sideways by default when wrap is not set", () => {
    const html = renderToStaticMarkup(<CodeBlock code="a very long line" />);
    expect(html).toContain("w-max");
    expect(html).not.toContain("whitespace-pre-wrap");
  });
});
