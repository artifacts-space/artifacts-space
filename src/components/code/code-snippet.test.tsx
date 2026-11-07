import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CodeSnippet, CommandSnippet } from "./code-snippet";

const highlightCode = vi.hoisted(() => vi.fn());

vi.mock("#syntax-highlight", () => ({ highlightCode }));

describe("CodeSnippet", () => {
  beforeEach(() => {
    highlightCode.mockReset();
    highlightCode.mockReturnValue(null);
  });

  it("should render server-highlighted lines when the highlighter returns them", () => {
    highlightCode.mockReturnValue([[{ text: "{}", kind: "punctuation" }]]);
    const html = renderToStaticMarkup(<CodeSnippet code="{}" language="json" title="mcp.json" />);
    expect(highlightCode).toHaveBeenCalledWith("{}", "json");
    expect(html).toContain('<span class="text-syntax-punctuation">{}</span>');
    expect(html).toContain("mcp.json");
  });

  it("should show plain text when the highlighter returns nothing", () => {
    const html = renderToStaticMarkup(<CodeSnippet code="plain words" />);
    expect(html).toContain("plain words</code>");
    expect(html).not.toContain("text-syntax-");
  });
});

describe("CommandSnippet", () => {
  beforeEach(() => {
    highlightCode.mockReset();
    highlightCode.mockReturnValue(null);
  });

  it("should highlight the command as bash when no language is given", () => {
    renderToStaticMarkup(<CommandSnippet command="pnpm db:migrate" />);
    expect(highlightCode).toHaveBeenCalledWith("pnpm db:migrate", "bash");
  });

  it("should show the command without the prompt in the code when it renders", () => {
    const html = renderToStaticMarkup(<CommandSnippet command="pnpm db:migrate" copyLabel="Copy migrate command" />);
    expect(html).toContain("pnpm db:migrate</code>");
    expect(html).toContain('aria-label="Copy migrate command"');
  });
});
