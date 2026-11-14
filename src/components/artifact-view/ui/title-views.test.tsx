import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BoardView } from "./board";
import { HeadingView } from "./content";
import { AccordionView, CardView, SectionView, SeparatorView, TabsView } from "./layout";

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

  it("should keep a Section's description and leave out its heading when the title is only spaces", () => {
    const html = renderToStaticMarkup(<SectionView props={{ title: "  ", description: "Describes" }} emit={emit}>x</SectionView>);
    expect(html).not.toContain("<h2");
    expect(html).toContain("Describes</p>");
  });

  it("should keep a Card's description and leave out its heading when the title is only spaces", () => {
    const html = renderToStaticMarkup(<CardView props={{ title: "  ", description: "Describes" }} emit={emit}>x</CardView>);
    expect(html).not.toContain("<h3");
    expect(html).toContain("Describes</p>");
  });

  it("should show no caption when a Board's title is only spaces", () => {
    const html = renderToStaticMarkup(<BoardView props={{ title: "  ", columns: [{ title: "To do", cards: [] }] }} emit={emit} />);
    expect(html).not.toContain("<figcaption");
  });

  it("should name an accordion item by its place when its title is only spaces", () => {
    const html = renderToStaticMarkup(<AccordionView props={{ items: [{ title: "Plan" }, { title: "  " }] }} emit={emit}>{null}</AccordionView>);
    expect(html).toContain("Plan");
    expect(html).toContain("Item 2");
  });

  it("should name a tab by its place when its label is only spaces", () => {
    const html = renderToStaticMarkup(<TabsView props={{ tabs: [{ label: "" }, { label: "Notes" }] }} emit={emit}>{null}</TabsView>);
    expect(html).toContain("Tab 1");
    expect(html).toContain("Notes");
  });

  it("should render no header when a Section's title and description are both only spaces", () => {
    const html = renderToStaticMarkup(<SectionView props={{ title: " ", description: "  " }} emit={emit}>x</SectionView>);
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<p");
  });

  it("should leave out a Card's description when it is only spaces", () => {
    const html = renderToStaticMarkup(<CardView props={{ title: "Plan", description: "  " }} emit={emit}>x</CardView>);
    expect(html).toContain("<h3");
    expect(html).not.toContain("<p");
  });

  it("should draw a plain rule when a Separator's label is only spaces", () => {
    expect(renderToStaticMarkup(<SeparatorView props={{ label: "  " }} emit={emit} />)).toMatch(/^<hr /);
  });
});
