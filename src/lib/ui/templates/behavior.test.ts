import { describe, expect, it } from "vitest";

import { actionHides, actionLabels, oneWayReasons, pictureLabels, pressButtons } from "./behavior";
import type { TemplateElement, UiTemplate } from "./types";

/** A navbar in small: links from a list, a sign-in link, a menu that opens and closes, a form that sends, and a picture. */
function sample(elements: Record<string, TemplateElement> = {}, state: Record<string, unknown> = {}): UiTemplate {
  return {
    id: "navbar-sample",
    name: "Sample",
    category: "navbar",
    description: "A sample for the behavior tests.",
    viewport: "fluid",
    surface: "page",
    slots: [{ what: "Links", state: "/links" }],
    fragment: {
      root: "bar",
      state: { open: false, sent: false, links: [{ label: "Product" }, { label: "Pricing" }], plan: "Team", ...state },
      elements: {
        bar: { type: "Box", props: {}, children: ["logo", "links", "menu", "panel", "send"] },
        logo: { type: "Placeholder", props: { label: "Logo" } },
        links: { type: "Box", props: { hideBelow: "md" }, repeat: { statePath: "/links" }, children: ["link"] },
        link: { type: "Link", props: { label: { $item: "label" } } },
        menu: { type: "Box", props: { hideAbove: "md" }, children: ["open", "close"] },
        open: { type: "Button", props: { label: "Open menu" }, on: { press: { action: "setState", params: { statePath: "/open", value: true } } } },
        close: { type: "Button", props: { label: "Close menu" }, on: { press: { action: "setState", params: { statePath: "/open", value: false } } } },
        panel: { type: "Box", props: { hideAbove: "md" }, children: ["choose"] },
        choose: { type: "Button", props: { label: { $template: "Choose ${/plan}" } } },
        send: { type: "Button", props: { label: "Send" }, on: { press: [{ action: "validateForm", params: { statePath: "/check" } }, { action: "setState", params: { statePath: "/sent", value: true } }] } },
        ...elements,
      },
    },
  };
}

describe("pressButtons", () => {
  it("should pair a button with the one that writes the starting value back when both set one path", () => {
    const { buttons } = pressButtons(sample());
    expect(buttons.find((button) => button.label === "Open menu")?.restoredBy).toEqual(["Close menu"]);
  });

  it("should give no restorer to a press that writes the starting value, or that nothing undoes", () => {
    const { buttons } = pressButtons(sample());
    expect(buttons.find((button) => button.label === "Close menu")?.restoredBy).toEqual([]);
    expect(buttons.find((button) => button.label === "Close menu")?.changesStart).toBe(false);
    expect(buttons.find((button) => button.label === "Send")).toMatchObject({ statePath: "/sent", value: true, changesStart: true, restoredBy: [] });
  });

  it("should follow the starting state when a menu starts open", () => {
    const { buttons } = pressButtons(sample({}, { open: true }));
    expect(buttons.find((button) => button.label === "Close menu")?.restoredBy).toEqual(["Open menu"]);
    expect(buttons.find((button) => button.label === "Open menu")?.restoredBy).toEqual([]);
  });

  it("should list every button that restores when a wide and a narrow one both close a menu", () => {
    const more: Record<string, TemplateElement> = { shut: { type: "Button", props: { label: "Product" }, on: { press: { action: "setState", params: { statePath: "/open", value: false } } } } };
    expect(pressButtons(sample(more)).buttons.find((button) => button.label === "Open menu")?.restoredBy).toEqual(["Close menu", "Product"]);
  });

  it("should leave out a press that changes no state, and name one whose label is not fixed", () => {
    const more: Record<string, TemplateElement> = {
      check: { type: "Button", props: { label: "Check" }, on: { press: { action: "validateForm", params: { statePath: "/check" } } } },
      remove: { type: "Button", props: { label: { $item: "label" } }, on: { press: { action: "removeState", params: { statePath: "/links", index: { $index: true } } } } },
    };
    const found = pressButtons(sample(more));
    expect(found.buttons.map((button) => button.label)).toEqual(["Open menu", "Close menu", "Send"]);
    expect(found.unlabelled).toEqual(["remove"]);
  });
});

describe("pressButtons, for a push and a remove", () => {
  /** A list a reader adds to and takes from: "Add link" pushes, and each row's "Remove link" takes that row. */
  const list: Record<string, TemplateElement> = {
    add: { type: "Button", props: { label: "Add link" }, on: { press: { action: "pushState", params: { statePath: "/links", value: { label: "Docs" } } } } },
    row: { type: "Box", props: {}, repeat: { statePath: "/links" }, children: ["remove"] },
    remove: { type: "Button", props: { label: "Remove link" }, on: { press: { action: "removeState", params: { statePath: "/links", index: { $index: true } } } } },
  };
  const find = (template: UiTemplate, label: string) => pressButtons(template).buttons.find((button) => button.label === label);

  it("should read a push as a press that changes the start and that no press undoes, when a remove on the same list exists", () => {
    expect(find(sample(list), "Add link")).toMatchObject({ action: "pushState", statePath: "/links", changesStart: true, restoredBy: [], oneWay: oneWayReasons.pushState });
  });

  it("should read a remove as one-way, and as changing the start only when its list starts with an item to take", () => {
    expect(find(sample(list), "Remove link")).toMatchObject({ action: "removeState", changesStart: true, restoredBy: [], oneWay: oneWayReasons.removeState });
    expect(find(sample(list, { links: [] }), "Remove link")).toMatchObject({ changesStart: false, oneWay: oneWayReasons.removeState });
    expect(find(sample(list, { links: "none" }), "Remove link")?.changesStart).toBe(false);
  });

  it("should read a remove at a fixed place as changing the start only when the list has an item there", () => {
    const fixed = (index: number): Record<string, TemplateElement> => ({ remove: { type: "Button", props: { label: "Remove link" }, on: { press: { action: "removeState", params: { statePath: "/links", index } } } } });
    expect(find(sample(fixed(1)), "Remove link")?.changesStart).toBe(true);
    expect(find(sample(fixed(2)), "Remove link")?.changesStart).toBe(false);
  });

  it("should give a reason to a setState nothing undoes, and none to one that is undone or writes the starting value", () => {
    expect(find(sample(), "Send")).toMatchObject({ action: "setState", oneWay: oneWayReasons.setState });
    expect(find(sample(), "Open menu")?.oneWay).toBeNull();
    expect(find(sample(), "Close menu")?.oneWay).toBeNull();
  });

  it("should never pair a setState with a push or a remove on the same path", () => {
    const more: Record<string, TemplateElement> = { reset: { type: "Button", props: { label: "Add link" }, on: { press: { action: "pushState", params: { statePath: "/open", value: false } } } } };
    expect(find(sample(more), "Open menu")?.restoredBy).toEqual(["Close menu"]);
  });
});

describe("actionLabels and pictureLabels", () => {
  it("should read a label written in the template, one per item of a repeat, and a $template filled from the state", () => {
    expect(actionLabels(sample()).labels.sort()).toEqual(["Choose Team", "Close menu", "Open menu", "Pricing", "Product", "Send"]);
    expect(actionLabels(sample()).unread).toEqual([]);
    expect(pictureLabels(sample())).toEqual(["Logo"]);
  });

  it("should fill a $template from each item when it reads the repeat's item", () => {
    const more: Record<string, TemplateElement> = { link: { type: "Link", props: { label: { $template: "See ${label} for ${/plan}" } } } };
    expect(actionLabels(sample(more)).labels).toEqual(expect.arrayContaining(["See Product for Team", "See Pricing for Team"]));
  });

  it("should name an element whose label only the browser can resolve", () => {
    const more: Record<string, TemplateElement> = { choose: { type: "Button", props: { label: { $cond: { $state: "/open" }, $then: "Close", $else: "Open" } } } };
    expect(actionLabels(sample(more)).unread).toEqual(["choose"]);
  });
});

describe("actionHides", () => {
  it("should list each Box that hides a link or a button at a width step, and skip one that hides only words", () => {
    const more: Record<string, TemplateElement> = { note: { type: "Box", props: { hideBelow: "sm" }, children: ["words"] }, words: { type: "Text", props: { text: "Words" } } };
    expect(actionHides(sample(more).fragment)).toEqual([
      { key: "links", side: "hideBelow", step: "md" },
      { key: "menu", side: "hideAbove", step: "md" },
      { key: "panel", side: "hideAbove", step: "md" },
    ]);
  });
});
