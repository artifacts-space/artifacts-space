import { describe, expect, it } from "vitest";

import { templateProblems } from "./rules";
import type { TemplateElement, UiTemplate } from "./types";

const good: UiTemplate = {
  id: "hero-plain",
  name: "Hero, plain",
  category: "hero",
  description: "A headline over a list of points.",
  viewport: "fluid",
  surface: "page",
  slots: [{ what: "Headline", element: "title", prop: "text" }, { what: "Points", state: "/points" }],
  fragment: {
    root: "hero",
    state: { points: [{ text: "Fast" }] },
    elements: {
      hero: { type: "Box", props: { direction: "vertical", surface: "page" }, children: ["title", "points"] },
      title: { type: "Heading", props: { text: "A headline", level: 2 } },
      points: { type: "Box", props: {}, repeat: { statePath: "/points" }, children: ["point"] },
      point: { type: "Text", props: { text: { $template: "${text}" } } },
    },
  },
};

/** The good template with some of its elements replaced or added. */
function withElements(elements: Record<string, TemplateElement>, children: string[] = ["title", "points"]): UiTemplate {
  const hero: TemplateElement = { type: "Box", props: { direction: "vertical", surface: "page" }, children };
  return { ...good, fragment: { ...good.fragment, elements: { ...good.fragment.elements, hero, ...elements } } };
}

const problemsOf = (template: UiTemplate, file: "heroes" | "nav" = "heroes") => templateProblems(template, file).join("\n");

describe("templateProblems", () => {
  it("should find nothing wrong when a template keeps every rule", () => {
    expect(templateProblems(good, "heroes")).toEqual([]);
  });

  it("should name an id that is not lowercase words, or does not start with its category", () => {
    expect(problemsOf({ ...good, id: "Hero_Plain" })).toMatch(/id "Hero_Plain" must be up to 40 lowercase letters/);
    expect(problemsOf({ ...good, id: "plain-hero" })).toMatch(/must start with its category, "hero-"/);
  });

  it("should name a template that sits in another batch's file", () => {
    expect(problemsOf(good, "nav")).toMatch(/category "hero" belongs in heroes\.ts, not nav\.ts/);
  });

  it("should name a missing name, a description that is not one closed sentence, and empty slots", () => {
    expect(problemsOf({ ...good, name: " " })).toMatch(/name must be 1 to 60 characters/);
    expect(problemsOf({ ...good, description: "No period" })).toMatch(/description must be one sentence/);
    expect(problemsOf({ ...good, slots: [] })).toMatch(/slots is empty/);
  });

  it("should name a root that is missing or is not a Box", () => {
    expect(problemsOf({ ...good, fragment: { ...good.fragment, root: "nope" } })).toMatch(/root "nope" is not one of its elements/);
    expect(problemsOf({ ...good, fragment: { root: "title", elements: { title: { type: "Heading", props: { text: "A headline" } } } } })).toMatch(/root "title" must be a Box/);
  });

  it("should name a root that paints another surface than the template says", () => {
    expect(problemsOf({ ...good, surface: "muted" })).toMatch(/the root paints surface "page" but the template says "muted"/);
  });

  it("should name an element key that is not lowercase words", () => {
    expect(problemsOf(withElements({ Extra_Key: { type: "Text", props: { text: "x" } } }, ["title", "points", "Extra_Key"]))).toMatch(/element key "Extra_Key"/);
  });

  it("should name a template over the element budget or nested too deep", () => {
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`t${String(index)}`, { type: "Text", props: { text: "x" } }]));
    expect(problemsOf(withElements(many, ["title", "points", ...Object.keys(many)]))).toMatch(/64 elements; the budget is 60/);
    const chain = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`b${String(index)}`, { type: "Box", props: {}, children: index < 9 ? [`b${String(index + 1)}`] : [] }]));
    expect(problemsOf(withElements(chain, ["title", "points", "b0"]))).toMatch(/nested 11 levels deep; the budget is 10/);
  });

  it("should name a first heading below level 2, and allow a deeper one after it", () => {
    expect(problemsOf(withElements({ title: { type: "Heading", props: { text: "A headline", level: 3 } } }))).toMatch(/its first heading is level 3\. Start a template at level 2/);
    expect(templateProblems(withElements({ sub: { type: "Heading", props: { text: "A detail", level: 3 } } }, ["title", "sub", "points"]), "heroes")).toEqual([]);
  });

  it("should name a Box that hides a link below a step when none hides links or buttons above that step, and allow a pair", () => {
    const narrow: TemplateElement = { type: "Box", props: { hideBelow: "md" }, children: ["go"] };
    const go: TemplateElement = { type: "Link", props: { label: "Pricing" } };
    const menu = (step: string): TemplateElement => ({ type: "Box", props: { hideAbove: step }, children: ["open"] });
    const open: TemplateElement = { type: "Button", props: { label: "Open menu" } };
    const children = ["title", "points", "narrow", "menu"];
    expect(problemsOf(withElements({ narrow, go, menu: menu("sm"), open }, children))).toMatch(/element "narrow" hides links or buttons with `hideBelow: "md"`, but no Box holds any with `hideAbove: "md"`/);
    expect(problemsOf(withElements({ narrow, go, menu: menu("sm"), open }, children))).toMatch(/element "menu" hides links or buttons with `hideAbove: "sm"`/);
    expect(templateProblems(withElements({ narrow, go, menu: menu("md"), open }, children), "heroes")).toEqual([]);
    // Words alone may hide with no counterpart.
    expect(templateProblems(withElements({ narrow: { type: "Box", props: { hideBelow: "md" }, children: ["note"] }, note: { type: "Text", props: { text: "A note" } } }, ["title", "points", "narrow"]), "heroes")).toEqual([]);
  });

  it("should name a condition and a starting value that are not one of a bound Select's options, and allow ones that are", () => {
    const speed: TemplateElement = { type: "Select", props: { label: "Speed", options: ["Standard", "Express"], value: { $bindState: "/speed" } } };
    const cost = (words: string): TemplateElement => ({ type: "Text", props: { text: { $cond: { $state: "/speed", eq: words }, $then: "$12", $else: "Free" } } });
    const withChoice = (start: string, words: string): UiTemplate => {
      const base = withElements({ speed, cost: cost(words) }, ["title", "points", "speed", "cost"]);
      return { ...base, fragment: { ...base.fragment, state: { ...base.fragment.state, speed: start } } };
    };
    expect(templateProblems(withChoice("Standard", "Express"), "heroes")).toEqual([]);
    expect(templateProblems(withChoice("Standard", "Express, next day"), "heroes").join("\n")).toMatch(/a condition compares \/speed with "Express, next day", which is not one of the options of "speed"/);
    expect(templateProblems(withChoice("Slow", "Express"), "heroes").join("\n")).toMatch(/element "speed" starts at "Slow" \(\/speed\), which is not one of its options/);
  });

  it("should name a state-changing button whose label is not fixed, and a label only the browser can resolve", () => {
    const remove: TemplateElement = { type: "Button", props: { label: { $template: "Remove ${text}" } }, on: { press: { action: "removeState", params: { statePath: "/points", index: { $index: true } } } } };
    const withRemove = withElements({ points: { type: "Box", props: {}, repeat: { statePath: "/points" }, children: ["point", "remove"] }, remove });
    expect(problemsOf(withRemove)).toMatch(/element "remove" changes state when pressed, but its label is not written in the template/);
    const either: TemplateElement = { type: "Link", props: { label: { $cond: { $state: "/points/0/text", eq: "Fast" }, $then: "Fast", $else: "Slow" } } };
    expect(problemsOf(withElements({ either }, ["title", "points", "either"]))).toMatch(/element "either": its label cannot be read from the template/);
  });

  it("should name a toggle whose path does not start as true or false, and accept one that does", () => {
    const menu = (statePath: string): TemplateElement => ({ type: "Button", props: { label: "Menu" }, on: { press: { action: "toggleState", params: { statePath } } } });
    const withToggle = (statePath: string, state: Record<string, unknown>): UiTemplate => {
      const base = withElements({ menu: menu(statePath) }, ["title", "points", "menu"]);
      return { ...base, fragment: { ...base.fragment, state: { ...base.fragment.state, ...state } } };
    };
    expect(templateProblems(withToggle("/open", { open: false }), "heroes")).toEqual([]);
    expect(problemsOf(withToggle("/open", { open: "no" }))).toMatch(/element "menu" runs toggleState on "\/open", which does not start as true or false/);
    expect(problemsOf(withToggle("/menu/open", { menu: {} }))).toMatch(/element "menu" runs toggleState on "\/menu\/open", which does not start as true or false/);
  });

  it("should name a component that needs an upload", () => {
    expect(problemsOf(withElements({ shot: { type: "Image", props: { file: "00000000-0000-4000-8000-000000000000", alt: "x" } } }, ["title", "points", "shot"]))).toMatch(/Image needs an upload\. Use Placeholder/);
  });

  it("should name a link that points anywhere but an example domain, and allow one that does", () => {
    expect(problemsOf(withElements({ more: { type: "Link", props: { label: "More", href: "https://some-company.test/page" } } }, ["title", "points", "more"]))).toMatch(/leave `href` out/);
    expect(templateProblems(withElements({ more: { type: "Link", props: { label: "More", href: "https://example.com/docs" } } }, ["title", "points", "more"]), "heroes")).toEqual([]);
  });

  it("should name a validateForm action that names no statePath", () => {
    expect(problemsOf(withElements({ go: { type: "Button", props: { label: "Go" }, on: { press: { action: "validateForm" } } } }, ["title", "points", "go"]))).toMatch(/validateForm must name its `statePath`/);
  });

  it("should name a bare template name outside a repeat", () => {
    expect(problemsOf(withElements({ title: { type: "Heading", props: { text: { $template: "Hello ${name}" } } } }))).toMatch(/element "title": a bare \$\{name\} in \$template reads a repeat's item/);
  });

  it("should name a state path that does not start at a key of the template's state", () => {
    expect(problemsOf(withElements({ title: { type: "Heading", props: { text: { $state: "/headline" } } } }))).toMatch(/element "title" uses \/headline, which does not start at a key of the template's state/);
    expect(problemsOf(withElements({ title: { type: "Heading", props: { text: { $template: "Hi ${/who}" } } } }))).toMatch(/uses \/who/);
  });

  it("should name a repeat over something that is not a list with items", () => {
    expect(problemsOf({ ...good, slots: [{ what: "Headline", element: "title", prop: "text" }], fragment: { ...good.fragment, state: { points: [] } } })).toMatch(/repeats \/points, which is not a list with items/);
  });

  it("should name a slot that points at nothing", () => {
    expect(problemsOf({ ...good, slots: [{ what: "Gone", element: "missing", prop: "text" }] })).toMatch(/slot "Gone" points at element "missing"/);
    expect(problemsOf({ ...good, slots: [{ what: "Unset", element: "title", prop: "size" }] })).toMatch(/slot "Unset" points at title\.size, which is not set/);
    expect(problemsOf({ ...good, slots: [{ what: "No state", state: "/nothing" }] })).toMatch(/slot "No state" points at \/nothing/);
  });

  it("should name every validation issue, warnings too, when the template is drawn as a spec", () => {
    expect(problemsOf(withElements({ title: { type: "Heading", props: { text: "A headline", colour: "red" } } }))).toMatch(/as a spec: Element "hero-plain-title" \(Heading\): prop "colour" is not a Heading prop/);
    expect(problemsOf(withElements({ title: { type: "Headline", props: { text: "x" } } }))).toMatch(/as a spec: .*unknown component "Headline"/);
  });
});
