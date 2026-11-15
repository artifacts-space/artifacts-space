import { describe, expect, it } from "vitest";

import { allowedActions } from "../validate-element";

import { actionHides, actionLabels, oneWayReasons, pictureLabels, pressButtons, stateActions, unpressedActions } from "./behavior";
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

describe("pressButtons, for a toggle", () => {
  const toggle = (label: string, statePath = "/open"): TemplateElement => ({ type: "Button", props: { label }, on: { press: { action: "toggleState", params: { statePath } } } });
  const find = (template: UiTemplate, label: string) => pressButtons(template).buttons.find((button) => button.label === label);

  it("should read a toggle as a press its own button undoes, whether its path starts false or true", () => {
    expect(find(sample({ flip: toggle("Menu") }), "Menu")).toMatchObject({ action: "toggleState", statePath: "/open", changesStart: true, oneWay: null });
    expect(find(sample({ flip: toggle("Menu") }), "Menu")?.restoredBy[0]).toBe("Menu");
    expect(find(sample({ flip: toggle("Menu") }, { open: true }), "Menu")).toMatchObject({ changesStart: true, oneWay: null });
    expect(find(sample({ flip: toggle("Menu") }, { open: true }), "Menu")?.restoredBy[0]).toBe("Menu");
  });

  it("should name its own button first, then a button that writes the starting value back", () => {
    // The sample's "Close menu" writes false to /open, where the menu starts; "Open menu" writes true and undoes nothing.
    expect(find(sample({ flip: toggle("Menu") }), "Menu")?.restoredBy).toEqual(["Menu", "Close menu"]);
    expect(find(sample({ flip: toggle("Menu") }, { open: true }), "Menu")?.restoredBy).toEqual(["Menu", "Open menu"]);
  });

  it("should let a toggle undo a setState on its path, and only one that leaves the other boolean", () => {
    expect(find(sample({ flip: toggle("Menu") }), "Open menu")?.restoredBy).toEqual(["Close menu", "Menu"]);
    const words: Record<string, TemplateElement> = {
      flip: toggle("Menu", "/plan"),
      pick: { type: "Button", props: { label: "Pick Solo" }, on: { press: { action: "setState", params: { statePath: "/plan", value: "Solo" } } } },
    };
    // After "Pick Solo" the path holds a word; a toggle would leave true, not the starting "Team".
    expect(find(sample(words), "Pick Solo")).toMatchObject({ restoredBy: [], oneWay: oneWayReasons.setState });
  });

  it("should find a toggle whose label is a $cond by the words it shows at the start, and name the other branch to undo it", () => {
    const flip: TemplateElement = { type: "Button", props: { label: { $cond: { $state: "/sent" }, $then: "Hide details", $else: "Show details" } }, on: { press: { action: "toggleState", params: { statePath: "/sent" } } } };
    expect(find(sample({ flip }), "Show details")).toMatchObject({ action: "toggleState", restoredBy: ["Hide details"], oneWay: null });
    // Started open, the sample's "Send" also writes true back, after the button itself.
    expect(find(sample({ flip }, { sent: true }), "Hide details")?.restoredBy).toEqual(["Show details", "Send"]);
    const negated: TemplateElement = { ...flip, props: { label: { $cond: { $state: "/sent", not: true }, $then: "Show details", $else: "Hide details" } } };
    expect(find(sample({ flip: negated }), "Show details")?.restoredBy).toEqual(["Hide details"]);
    const compared: TemplateElement = { ...flip, props: { label: { $cond: { $state: "/sent", eq: true }, $then: "Hide details", $else: "Show details" } } };
    expect(find(sample({ flip: compared }), "Show details")?.restoredBy).toEqual(["Hide details"]);
  });

  it("should name a toggle as unlabelled when its $cond reads something the fragment cannot resolve", () => {
    const flip: TemplateElement = { type: "Button", props: { label: { $cond: { $or: [{ $state: "/sent" }, { $state: "/open" }] }, $then: "Hide", $else: "Show" } }, on: { press: { action: "toggleState", params: { statePath: "/sent" } } } };
    expect(pressButtons(sample({ flip })).unlabelled).toEqual(["flip"]);
  });

  it("should find a restorer by the words it shows after the press, when its label follows the state", () => {
    const shut: TemplateElement = { type: "Button", props: { label: { $cond: { $state: "/open" }, $then: "Hide panel", $else: "Panel is hidden" } }, on: { press: { action: "setState", params: { statePath: "/open", value: false } } } };
    expect(find(sample({ shut }), "Open menu")?.restoredBy).toEqual(["Close menu", "Hide panel"]);
  });

  it("should never read a toggle as one-way, when no other button touches its path", () => {
    const alone = find(sample({ flip: toggle("Menu", "/sent") }), "Menu");
    expect(alone).toMatchObject({ restoredBy: ["Menu"], oneWay: null, changesStart: true });
  });
});

describe("pressButtons, for a button that says whether what it opens is open", () => {
  const find = (template: UiTemplate, label: string) => pressButtons(template).buttons.find((button) => button.label === label);
  const toggle = (expanded: unknown, statePath = "/open"): TemplateElement => ({ type: "Button", props: { label: "Menu", expanded }, on: { press: { action: "toggleState", params: { statePath } } } });

  it("should read expanded from the state a toggle flips, before and after the press", () => {
    expect(find(sample({ flip: toggle({ $state: "/open" }) }), "Menu")?.expanded).toEqual({ atStart: false, afterPress: true });
    expect(find(sample({ flip: toggle({ $state: "/open" }) }, { open: true }), "Menu")?.expanded).toEqual({ atStart: true, afterPress: false });
  });

  it("should read expanded with not and eq, and from a setState", () => {
    expect(find(sample({ flip: toggle({ $state: "/open", not: true }) }), "Menu")?.expanded).toEqual({ atStart: true, afterPress: false });
    expect(find(sample({ flip: toggle({ $state: "/plan", eq: "Solo" }) }), "Menu")?.expanded).toEqual({ atStart: false, afterPress: false });
    const opener: TemplateElement = { type: "Button", props: { label: "Show all", expanded: { $state: "/sent" } }, on: { press: { action: "setState", params: { statePath: "/sent", value: true } } } };
    expect(find(sample({ opener }), "Show all")?.expanded).toEqual({ atStart: false, afterPress: true });
  });

  it("should keep a written true or false through the press", () => {
    expect(find(sample({ flip: toggle(true) }), "Menu")?.expanded).toEqual({ atStart: true, afterPress: true });
  });

  it("should leave expanded unread when the button has none, or the fragment cannot resolve it", () => {
    expect(find(sample({ flip: toggle(undefined) }), "Menu")?.expanded).toBeNull();
    expect(find(sample({ flip: toggle({ $or: [{ $state: "/open" }, { $state: "/sent" }] }) }), "Menu")?.expanded).toBeNull();
    expect(find(sample(), "Open menu")?.expanded).toBeNull();
  });

  it("should read every toggle that says whether it is open in the templates", async () => {
    const { uiTemplates } = await import("./index");
    const toggles = uiTemplates.flatMap((template) => pressButtons(template).buttons.filter((button) => button.action === "toggleState").map((button) => ({ id: template.id, key: button.key, expanded: button.expanded })));
    expect(toggles.length).toBeGreaterThan(0);
    // Every menu toggle in the templates says whether its menu is open, and the fragment can follow it.
    expect(toggles.filter((toggle) => toggle.expanded === null)).toEqual([]);
    // A press flips it, whichever way the menu starts (navbar-collapsible starts open).
    for (const toggle of toggles) expect(toggle.expanded?.afterPress, `${toggle.id} "${toggle.key}"`).toBe(toggle.expanded?.atStart === false);
  });
});

describe("the actions the validator allows", () => {
  it("should have every allowed action either read as a state action or listed as not pressed, with a reason", () => {
    const read = new Set<string>(stateActions);
    const unread = [...allowedActions].filter((action) => !read.has(action) && (unpressedActions[action] ?? "").trim() === "");
    expect(unread).toEqual([]);
  });

  it("should list no action twice, and none the validator does not allow", () => {
    const listed = [...stateActions, ...Object.keys(unpressedActions)];
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.filter((action) => !allowedActions.has(action))).toEqual([]);
  });

  it("should fail the check above when an action is in neither list", () => {
    const read = new Set<string>(stateActions);
    const unread = [...allowedActions, "openDialog"].filter((action) => !read.has(action) && (unpressedActions[action] ?? "").trim() === "");
    expect(unread).toEqual(["openDialog"]);
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
    const more: Record<string, TemplateElement> = { choose: { type: "Button", props: { label: { $cond: { $state: "/open" }, $then: "Close", $else: { $state: "/plan" } } } } };
    expect(actionLabels(sample(more)).unread).toEqual(["choose"]);
  });

  it("should read both branches of a $cond label when each is fixed words", () => {
    const more: Record<string, TemplateElement> = { choose: { type: "Button", props: { label: { $cond: { $state: "/open" }, $then: "Hide plans", $else: "Show plans" } } } };
    expect(actionLabels(sample(more)).unread).toEqual([]);
    expect(actionLabels(sample(more)).labels).toEqual(expect.arrayContaining(["Hide plans", "Show plans"]));
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
