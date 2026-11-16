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

  it("should accept a browser frame when its address is an expression read from state", () => {
    expect(layoutProblems(templateWith({ shot: shot({ address: { $state: "/address" } }) }, ["title", "shot"], [addressSlot]))).toEqual([]);
  });

  it("should name a browser frame whose address no slot names", () => {
    expect(layoutProblems(templateWith({ shot: shot({ address: "app.example.com" }) }, ["title", "shot"])).join("\n")).toMatch(/no slot names its `address`/);
  });

  it("should leave a phone frame and an unframed picture alone", () => {
    expect(layoutProblems(templateWith({ shot: shot({ frame: "phone" }), plain: { type: "Placeholder", props: { label: "Photo" } } }, ["title", "shot", "plain"]))).toEqual([]);
  });
});

describe("layoutProblems, reversed rows", () => {
  /** A reversed row of `first` and `second`, each a Box that holds the element named. */
  const reversedRow = (first: TemplateElement, second: TemplateElement, reverseBelow: unknown = true) =>
    templateWith(
      {
        row: { type: "Box", props: { direction: "horizontal", stackBelow: "md", reverseBelow }, children: ["one", "two"] },
        one: { type: "Box", props: {}, children: ["a"] },
        two: { type: "Box", props: {}, children: ["b"] },
        a: first,
        b: second,
      },
      ["row"],
    );
  const picture: TemplateElement = { type: "Placeholder", props: { label: "Picture" } };
  const words: TemplateElement = { type: "Text", props: { text: "Words" } };
  const button: TemplateElement = { type: "Button", props: { label: "Go" } };

  it("should find nothing when a reversed row holds only words and pictures, even behind an expression", () => {
    expect(layoutProblems(reversedRow(picture, words))).toEqual([]);
    expect(layoutProblems(reversedRow(picture, words, { $item: "pictureFirst" }))).toEqual([]);
  });

  it("should find nothing when one child holds all the focusable things, since their order among themselves is unchanged", () => {
    expect(layoutProblems(reversedRow(picture, button))).toEqual([]);
    const crowded = templateWith({ row: { type: "Box", props: { direction: "horizontal", stackBelow: "md", reverseBelow: true }, children: ["one", "two"] }, one: { type: "Box", props: {}, children: ["a", "b"] }, two: picture, a: button, b: { type: "Input", props: { label: "Email" } } }, ["row"]);
    expect(layoutProblems(crowded)).toEqual([]);
  });

  it("should name a reversed row whose children each hold a control", () => {
    const problems = layoutProblems(reversedRow(button, { type: "Input", props: { label: "Email" } })).join("\n");
    expect(problems).toMatch(/element "row" draws its children in reverse.*"one", "two" each hold something a reader can focus/);
  });

  it("should count each kind a keyboard reaches: fields, toggles, tabs, tables, code, and anything with a binding", () => {
    const kinds: Record<string, TemplateElement> = {
      Input: { type: "Input", props: { label: "Email" } },
      Textarea: { type: "Textarea", props: { label: "Note" } },
      Select: { type: "Select", props: { label: "Plan", options: ["A"] } },
      Checkbox: { type: "Checkbox", props: { label: "Agree" } },
      Switch: { type: "Switch", props: { label: "Yearly" } },
      Slider: { type: "Slider", props: {} },
      Checklist: { type: "Checklist", props: { items: ["One"] } },
      Tabs: { type: "Tabs", props: { tabs: ["One"] } },
      Accordion: { type: "Accordion", props: { items: ["One"] } },
      Table: { type: "Table", props: {} },
      Code: { type: "Code", props: { code: "x" } },
      "Link with an href": { type: "Link", props: { label: "Docs", href: "https://example.com/docs" } },
      "scrolling Box": { type: "Box", props: { overflow: "scroll", label: "Rows" } },
      "Markdown with a link": { type: "Markdown", props: { content: "See [the docs](https://example.com)." } },
      "Text with a binding": { type: "Text", props: { text: "Tap" }, on: { press: { action: "setState", params: { statePath: "/x", value: 1 } } } },
    };
    for (const [name, kind] of Object.entries(kinds)) {
      expect(layoutProblems(reversedRow(kind, button)).join("\n"), name).toMatch(/each hold something a reader can focus/);
    }
  });

  it("should not count what a keyboard cannot reach: a Link without an href, plain Markdown, a clipped Box, words, and display pieces", () => {
    const quiet: Record<string, TemplateElement> = {
      "Link without an href": { type: "Link", props: { label: "Docs" } },
      "plain Markdown": { type: "Markdown", props: { content: "Just **words**." } },
      "clipped Box": { type: "Box", props: { overflow: "hidden" } },
      Heading: { type: "Heading", props: { text: "Title" } },
      Badge: { type: "Badge", props: { label: "New" } },
      Kbd: { type: "Kbd", props: { keys: ["K"] } },
      Rating: { type: "Rating", props: { value: 4 } },
    };
    for (const [name, kind] of Object.entries(quiet)) {
      expect(layoutProblems(reversedRow(kind, button)), name).toEqual([]);
    }
  });

  it("should allow focusable things in two children of a row that is not reversed", () => {
    expect(layoutProblems(reversedRow(button, button, false))).toEqual([]);
  });
});

describe("layoutProblems, buttons in a stacking row", () => {
  /** A stretching row holding a title and `action`, with a Button named "go" either directly or alone in a Box named "action". */
  const stacking = (props: TemplateElement["props"], button: TemplateElement["props"] = {}, wrapped = false) =>
    templateWith(
      {
        bar: { type: "Box", props: { direction: "horizontal", stackBelow: "md", ...props }, children: ["title", wrapped ? "action" : "go"] },
        action: { type: "Box", props: { direction: "vertical" }, children: ["go"] },
        go: { type: "Button", props: { label: "Talk to us", ...button } },
      },
      ["bar"],
    );
  const stretch = { align: "center", alignBelow: "stretch" } as const;

  it("should name a bare button in a row that stacks with alignBelow stretch, since a button never stretches", () => {
    expect(layoutProblems(stacking(stretch)).join("\n")).toMatch(/"go" is a button in the row "bar".*Put it alone in a Box.*give the button `fullWidth`/);
  });

  it("should name the half-fix of a Box around a button that is not fullWidth, and say the button gets the prop", () => {
    expect(layoutProblems(stacking(stretch, {}, true)).join("\n")).toMatch(/"go" sits alone in the Box "action" of the row "bar".*Give the button "go" `fullWidth`/);
  });

  it("should name the half-fix of fullWidth on a button that is still a direct child, since it would take the whole row", () => {
    expect(layoutProblems(stacking(stretch, { fullWidth: true })).join("\n")).toMatch(/"go" is a `fullWidth` button drawn directly in the row "bar".*Put it alone in a Box/);
  });

  it("should find nothing when the button is fullWidth and alone in a Box", () => {
    expect(layoutProblems(stacking(stretch, { fullWidth: true }, true))).toEqual([]);
  });

  it("should leave a Box that holds several buttons alone, since that is a row of actions", () => {
    const actions = templateWith(
      {
        bar: { type: "Box", props: { direction: "horizontal", stackBelow: "md", ...stretch }, children: ["title", "actions"] },
        actions: { type: "Box", props: { direction: "horizontal", wrap: true }, children: ["one", "two"] },
        one: { type: "Button", props: { label: "Try it" } },
        two: { type: "Button", props: { label: "Watch" } },
      },
      ["bar"],
    );
    expect(layoutProblems(actions)).toEqual([]);
  });

  it("should leave a row that does not say how it stacks, or that aligns its stacked children to a side, alone", () => {
    expect(layoutProblems(stacking({}))).toEqual([]);
    expect(layoutProblems(stacking({ align: "center", alignBelow: "start" }))).toEqual([]);
    expect(layoutProblems(stacking({ align: "center", alignBelow: "start" }, {}, true))).toEqual([]);
  });

  it("should leave a row that never stacks alone", () => {
    const never = templateWith({ bar: { type: "Box", props: { direction: "horizontal", alignBelow: "stretch" }, children: ["go"] }, go: { type: "Button", props: { label: "Go" } } }, ["bar"]);
    expect(layoutProblems(never)).toEqual([]);
  });
});
