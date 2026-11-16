import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ArtifactKind } from "@/lib/artifact-types";

import { InlineContent } from "./inline-content";

const noop = () => undefined;

/** The source view of an artifact on its page, with a way back offered. */
function sourceOf(kind: ArtifactKind, content: string): string {
  return renderToStaticMarkup(
    <InlineContent surface="page" kind={kind} content={content} language="" title="Fixture" files={[]} revision={0} sourceOpen onChange={noop} onShowSource={noop} onHideSource={noop} />,
  );
}

describe("InlineContent", () => {
  it("should offer Hide source above the source when the format has another view", () => {
    expect(sourceOf("json", "{}")).toContain("Hide source");
    expect(sourceOf("markdown", "# Title")).toContain("Hide source");
  });

  it("should offer no Hide source when the artifact is code, which is its own source", () => {
    const html = sourceOf("code", "const one = 1;");
    expect(html).toContain("<textarea");
    expect(html).not.toContain("Hide source");
  });

  it("should offer no Hide source when the page gives no way to close the source", () => {
    const html = renderToStaticMarkup(
      <InlineContent surface="page" kind="json" content="{}" language="" title="Fixture" files={[]} revision={0} sourceOpen onChange={noop} onShowSource={noop} />,
    );
    expect(html).not.toContain("Hide source");
  });
});
