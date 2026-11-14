import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HeadingView } from "./content";
import { CardView, SectionView } from "./layout";

const emit = () => undefined;

describe("title views", () => {
  it("should render no heading when a Heading block's text is only spaces", () => {
    expect(renderToStaticMarkup(<HeadingView props={{ text: "   " }} emit={emit} />)).toBe("");
  });

  it("should render the heading when a Heading block has words", () => {
    expect(renderToStaticMarkup(<HeadingView props={{ text: "Plan", level: 2 }} emit={emit} />)).toMatch(/^<h2 [^>]*>Plan<\/h2>$/);
  });

  it("should leave out a Section's heading when its title is only spaces", () => {
    const html = renderToStaticMarkup(<SectionView props={{ title: "  " }} emit={emit}>x</SectionView>);
    expect(html).not.toContain("<h2");
  });

  it("should leave out a Card's heading when its title is only spaces", () => {
    const html = renderToStaticMarkup(<CardView props={{ title: " \n " }} emit={emit}>x</CardView>);
    expect(html).not.toContain("<h3");
  });
});
