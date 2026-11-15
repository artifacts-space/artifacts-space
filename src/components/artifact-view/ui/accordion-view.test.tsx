import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactView } from "../artifact-view";

/*
 * An open accordion panel must not be a landmark: one screen drawn twice on
 * a page (two canvas frames, two widths of one template) would list two
 * regions with one name. These read the markup of an accordion whose first
 * item starts open.
 */

function accordion(openFirst: boolean): string {
  const spec = {
    version: 1,
    root: "faq",
    elements: {
      faq: { type: "Accordion", props: { openFirst, items: [{ title: "How long is the trial?" }, { title: "Can I cancel?" }] }, children: ["first", "second"] },
      first: { type: "Text", props: { text: "Thirty days." } },
      second: { type: "Text", props: { text: "At any time." } },
    },
  };
  return renderToStaticMarkup(<ArtifactView kind="ui" content={JSON.stringify(spec)} title="Test" />);
}

/** The opening tag of the first element that has `attribute`. */
function tagWith(html: string, attribute: string): string {
  return new RegExp(`<[a-z0-9]+\\b[^>]*${attribute}[^>]*>`).exec(html)?.[0] ?? "";
}

const valueOf = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

describe("an open accordion panel", () => {
  it("should be a group named by its button, and never a region, when the first item starts open", () => {
    const html = accordion(true);
    expect(html).not.toContain('role="region"');
    const panel = tagWith(html, 'data-slot="accordion-content"');
    expect(valueOf(panel, "role")).toBe("group");
    const button = tagWith(html, 'aria-expanded="true"');
    expect(button).toContain('data-slot="accordion-trigger"');
    // The panel takes its name from the button, and the button says which panel it opened.
    expect(valueOf(panel, "aria-labelledby")).toBe(valueOf(button, "id"));
    expect(valueOf(button, "aria-controls")).toBe(valueOf(panel, "id"));
    expect(html).toContain("Thirty days.");
  });

  it("should draw no panel and no region when every item starts closed", () => {
    const html = accordion(false);
    expect(html).not.toContain('role="region"');
    expect(html).not.toContain('aria-expanded="true"');
    expect(html).not.toContain("Thirty days.");
  });
});
