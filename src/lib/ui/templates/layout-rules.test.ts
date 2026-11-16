import { describe, expect, it } from "vitest";

import { layoutProblems } from "./layout-rules";
import type { TemplateElement, UiTemplate } from "./types";

/** A template with one root Box holding `elements`, and the slots it is given. */
function templateWith(elements: Record<string, TemplateElement>, children: string[], slots: UiTemplate["slots"] = [{ what: "Headline", element: "title", prop: "text" }], root: TemplateElement["props"] = {}): UiTemplate {
  return {
    id: "hero-plain",
    name: "Hero, plain",
    category: "hero",
    description: "A headline.",
    viewport: "fluid",
    surface: "page",
    slots,
    fragment: { root: "hero", elements: { hero: { type: "Box", props: { direction: "vertical", ...root }, children }, title: { type: "Heading", props: { text: "A headline" } }, ...elements } },
  };
}

const shot = (props: TemplateElement["props"]): TemplateElement => ({ type: "Placeholder", props: { label: "Screenshot", frame: "browser", ...props } });
const addressSlot = { what: "Example address", element: "shot", prop: "address" } as const;

describe("layoutProblems, browser frames", () => {
  it("should find nothing when a browser frame has an address and a slot names it", () => {
    expect(layoutProblems(templateWith({ shot: shot({ address: "app.example.com/stock" }) }, ["title", "shot"], [addressSlot]))).toEqual([]);
  });

  it("should name a browser frame that has no address", () => {
    expect(layoutProblems(templateWith({ shot: shot({}) }, ["title", "shot"], [addressSlot])).join("\n")).toMatch(/element "shot" draws a browser frame with no `address`/);
    expect(layoutProblems(templateWith({ shot: shot({ address: " " }) }, ["title", "shot"], [addressSlot])).join("\n")).toMatch(/no `address`/);
  });

  it("should name a browser frame whose address no slot names", () => {
    expect(layoutProblems(templateWith({ shot: shot({ address: "app.example.com" }) }, ["title", "shot"])).join("\n")).toMatch(/no slot names its `address`/);
  });

  it("should leave a phone frame and an unframed picture alone", () => {
    expect(layoutProblems(templateWith({ shot: shot({ frame: "phone" }), plain: { type: "Placeholder", props: { label: "Photo" } } }, ["title", "shot", "plain"]))).toEqual([]);
  });
});

describe("layoutProblems, reversed rows", () => {
  const row = (reverseBelow: unknown): TemplateElement => ({ type: "Box", props: { direction: "horizontal", stackBelow: "md", alignBelow: "stretch", reverseBelow }, children: ["picture", "words"] });
  const words: Record<string, TemplateElement> = { picture: { type: "Placeholder", props: { label: "Picture" } }, words: { type: "Box", props: {}, children: ["title"] } };

  it("should find nothing when a reversed row holds only words and a picture, even behind an expression", () => {
    expect(layoutProblems(templateWith({ row: row(true), ...words }, ["row"]))).toEqual([]);
    expect(layoutProblems(templateWith({ row: row({ $item: "pictureFirst" }), ...words }, ["row"]))).toEqual([]);
  });

  it("should name a button that sits anywhere under a reversed row", () => {
    const problems = layoutProblems(templateWith({ row: row(true), ...words, words: { type: "Box", props: {}, children: ["title", "go"] }, go: { type: "Button", props: { label: "Go" } } }, ["row"]));
    expect(problems.join("\n")).toMatch(/element "row" draws its children in reverse.*"go" can be pressed/);
  });

  it("should name an element with a binding as a control, whatever its type", () => {
    const tappable: TemplateElement = { type: "Text", props: { text: "Tap" }, on: { press: { action: "setState", params: { statePath: "/x", value: 1 } } } };
    expect(layoutProblems(templateWith({ row: row(true), ...words, words: { type: "Box", props: {}, children: ["tap"] }, tap: tappable }, ["row"])).join("\n")).toMatch(/"tap" can be pressed/);
  });

  it("should allow controls in a row that is not reversed", () => {
    const plain = { type: "Box", props: { direction: "horizontal", stackBelow: "md", reverseBelow: false }, children: ["go"] } satisfies TemplateElement;
    expect(layoutProblems(templateWith({ row: plain, go: { type: "Button", props: { label: "Go" } } }, ["row"]))).toEqual([]);
  });
});

describe("layoutProblems, buttons in a stacking row", () => {
  const stacking = (props: TemplateElement["props"], button: TemplateElement["props"] = {}, wrapped = false) =>
    templateWith(
      {
        bar: { type: "Box", props: { direction: "horizontal", stackBelow: "md", ...props }, children: ["title", wrapped ? "action" : "go"] },
        action: { type: "Box", props: { direction: "vertical" }, children: ["go"] },
        go: { type: "Button", props: { label: "Talk to us", ...button } },
      },
      ["bar"],
    );

  it("should name a bare button in a row that stacks with alignBelow stretch, since a button never stretches", () => {
    expect(layoutProblems(stacking({ align: "center", alignBelow: "stretch" })).join("\n")).toMatch(/"go" is a button in the row "bar".*Put it in a Box and give it `fullWidth`/);
  });

  it("should find nothing when the button is full width, or sits in a Box that stretches", () => {
    expect(layoutProblems(stacking({ alignBelow: "stretch" }, { fullWidth: true }))).toEqual([]);
    expect(layoutProblems(stacking({ alignBelow: "stretch" }, { fullWidth: true }, true))).toEqual([]);
  });

  it("should leave a row that does not say how it stacks, or that aligns its stacked children to a side, alone", () => {
    expect(layoutProblems(stacking({}))).toEqual([]);
    expect(layoutProblems(stacking({ align: "center", alignBelow: "start" }))).toEqual([]);
  });

  it("should leave a row that never stacks alone", () => {
    const never = templateWith({ bar: { type: "Box", props: { direction: "horizontal", alignBelow: "stretch" }, children: ["go"] }, go: { type: "Button", props: { label: "Go" } } }, ["bar"]);
    expect(layoutProblems(never)).toEqual([]);
  });
});
