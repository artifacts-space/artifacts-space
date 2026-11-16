import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { dangerHoverMix } from "@/lib/themes/derive";
import { announcedSpec } from "@/lib/ui/fixtures/screen";

import { ArtifactView } from "../artifact-view";

import { BoxView } from "./box";
import { MetricView, TableView } from "./data";
import { ButtonView } from "./inputs";
import { SeparatorView } from "./layout";
import { PlaceholderView } from "./screen";
import { toggleState, type StateAccess } from "./state-actions";

const emit = () => undefined;

function page(spec: unknown): string {
  return renderToStaticMarkup(<ArtifactView kind="ui" content={JSON.stringify(spec)} title="Test" />);
}

function box(props: Parameters<typeof BoxView>[0]["props"]): string {
  return renderToStaticMarkup(<BoxView props={props} emit={emit}>x</BoxView>);
}

const classesOf = (html: string) => /class="([^"]*)"/.exec(html)?.[1]?.split(" ") ?? [];

describe("a Box row once it has stacked", () => {
  it("should keep today's classes when a stacking row sets neither prop", () => {
    expect(classesOf(box({ direction: "horizontal", stackBelow: "md", align: "center", justify: "between" }))).toEqual(["min-w-0", "flex", "flex-col", "@2xl/ui:flex-row", "items-center", "justify-between"]);
  });

  it("should use alignBelow while stacked and the row's own align from the width where it is a row", () => {
    const classes = classesOf(box({ direction: "horizontal", stackBelow: "md", align: "center", alignBelow: "stretch" }));
    expect(classes).toContain("items-stretch");
    expect(classes).toContain("@2xl/ui:items-center");
    expect(classes).not.toContain("items-center");
  });

  it("should fall back to stretch in the row when the row sets no align of its own", () => {
    const classes = classesOf(box({ direction: "horizontal", stackBelow: "sm", alignBelow: "center" }));
    expect(classes).toContain("items-center");
    expect(classes).toContain("@xl/ui:items-stretch");
  });

  it("should stack last child first with reverseBelow and be a plain row again at the step", () => {
    const classes = classesOf(box({ direction: "horizontal", stackBelow: "lg", reverseBelow: true }));
    expect(classes).toContain("flex-col-reverse");
    expect(classes).toContain("@4xl/ui:flex-row");
    expect(classes).not.toContain("flex-col");
  });

  it("should keep children at the top of a reversed stack, where a reversed column would pack them at the bottom", () => {
    const start = classesOf(box({ direction: "horizontal", stackBelow: "md", reverseBelow: true, minHeight: "md" }));
    expect(start).toContain("justify-end");
    expect(start).toContain("@2xl/ui:justify-start");
    const end = classesOf(box({ direction: "horizontal", stackBelow: "md", reverseBelow: true, justify: "end" }));
    expect(end).toContain("justify-start");
    expect(end).toContain("@2xl/ui:justify-end");
    expect(classesOf(box({ direction: "horizontal", stackBelow: "md", reverseBelow: true, justify: "between" }))).toContain("justify-between");
  });

  it("should ignore both props on a Box that never stacks", () => {
    expect(classesOf(box({ alignBelow: "center", reverseBelow: true, align: "start" }))).toEqual(["min-w-0", "flex", "flex-col", "items-start"]);
    expect(box({ direction: "horizontal", alignBelow: "center", reverseBelow: true })).not.toContain("reverse");
  });

  it("should size every stacked-row class by the named container, never the window", () => {
    const html = box({ direction: "horizontal", stackBelow: "sm", align: "end", alignBelow: "start", reverseBelow: true, justify: "end" });
    expect(html).not.toMatch(/[\s"](sm|md|lg|xl):/);
    expect(html).not.toMatch(/[\s"]@(xl|2xl|4xl):/);
  });
});

describe("text that is announced", () => {
  it("should keep one polite live region per interface, empty when the interface is first drawn", () => {
    const html = page(announcedSpec);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toMatch(/<div role="status" aria-live="polite" aria-atomic="true"[^>]*class="sr-only"><\/div>/);
  });

  it("should not give the announced element a live role of its own", () => {
    const html = page({ version: 1, root: "e", elements: { e: { type: "Text", props: { text: "Thanks. You are on the list.", announce: true } } } });
    expect(html).toMatch(/<p class="[^"]*">Thanks\. You are on the list\.<\/p>/);
    expect(html).not.toMatch(/<p[^>]*(role|aria-live)=/);
  });

  it("should not speak text that is there from the start", () => {
    const html = page({ version: 1, root: "e", elements: { e: { type: "Callout", props: { title: "Saved", text: "Your changes are saved.", announce: true } } } });
    expect(html.match(/Your changes are saved\./g)).toHaveLength(1);
  });

  it("should leave the region out when an interface cannot be shown at all", () => {
    expect(page({ version: 1, root: "missing", elements: {} })).not.toContain('role="status"');
  });
});

describe("variants on Button, Metric, Separator, Select, and Placeholder", () => {
  it("should fill a danger Button with the danger tone and write its label in the page color", () => {
    const html = renderToStaticMarkup(<ButtonView props={{ label: "Delete project", variant: "danger" }} emit={emit} />);
    const classes = classesOf(html);
    expect(classes).toContain("bg-tone-danger");
    expect(classes).toContain("text-background");
    expect(classes).not.toContain("bg-primary");
    expect(classes).not.toContain("text-primary-foreground");
    expect(html).toContain('data-variant="danger"');
  });

  it("should move a danger Button's fill toward the text color under the pointer, by the step the theme rule checks", () => {
    const html = renderToStaticMarkup(<ButtonView props={{ label: "Delete project", variant: "danger" }} emit={emit} />);
    expect(classesOf(html)).toContain(`hover:bg-[color-mix(in_oklch,var(--tone-danger),var(--foreground)_${String(Math.round(dangerHoverMix * 100))}%)]`);
  });

  it("should leave the other Button variants as they were", () => {
    const html = renderToStaticMarkup(<ButtonView props={{ label: "Save" }} emit={emit} />);
    expect(classesOf(html)).toContain("bg-primary");
    expect(html).not.toContain("tone-danger");
  });

  it("should draw a plain Metric without the card, and the default with it", () => {
    const plain = renderToStaticMarkup(<MetricView props={{ label: "Teams", value: 12, change: 2, variant: "plain" }} emit={emit} />);
    const card = renderToStaticMarkup(<MetricView props={{ label: "Teams", value: 12, change: 2 }} emit={emit} />);
    expect(classesOf(card)).toContain("card-surface");
    expect(classesOf(plain)).not.toContain("card-surface");
    expect(classesOf(plain)).not.toContain("p-4");
    expect(plain.replace(/class="[^"]*"/, "")).toBe(card.replace(/class="[^"]*"/, ""));
  });

  it("should draw a vertical Separator as a separator with its orientation, stretched across its row and one pixel the other way", () => {
    const html = renderToStaticMarkup(<SeparatorView props={{ orientation: "vertical" }} emit={emit} />);
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(classesOf(html)).toEqual(expect.arrayContaining(["min-w-px", "min-h-px", "self-stretch", "shrink-0"]));
    // No fixed width: a fixed one pixel would leave it with no height once its row has stacked.
    expect(classesOf(html)).not.toContain("w-px");
    expect(renderToStaticMarkup(<SeparatorView props={{}} emit={emit} />)).toBe('<hr class="my-2 border-border"/>');
  });

  it("should let a Select fill its container with fullWidth and keep its cap without", () => {
    const select = (props: Record<string, unknown>) => page({ version: 1, root: "e", elements: { e: { type: "Select", props: { label: "Country", options: ["Canada"], ...props } } } });
    const field = (html: string) => /<div class="([^"]*)"><span id=/.exec(html)?.[1]?.split(" ") ?? [];
    const capped = select({});
    const full = select({ fullWidth: true });
    expect(capped).toContain("max-w-sm");
    expect(full).not.toContain("max-w-sm");
    expect(field(full)).toContain("w-full");
    expect(field(capped)).toEqual(["flex", "min-w-0", "flex-col", "gap-1.5"]);
  });

  it("should draw a browser or a phone around the stand-in, with the frame hidden from screen readers and one named image", () => {
    for (const frame of ["browser", "phone"] as const) {
      const html = renderToStaticMarkup(<PlaceholderView props={{ frame, label: "Dashboard" }} emit={emit} />);
      expect(html).toContain(`data-frame="${frame}"`);
      expect(html.match(/role="img"/g)).toHaveLength(1);
      expect(html).toContain('aria-label="Dashboard"');
      expect(html).toMatch(/<div aria-hidden="true"/);
      expect(html).not.toMatch(/<(button|a|input)\b/);
    }
  });

  it("should write the address in the browser bar, hidden from screen readers with the rest of the frame", () => {
    const html = renderToStaticMarkup(<PlaceholderView props={{ frame: "browser", label: "Dashboard", address: "app.example.com/stock" }} emit={emit} />);
    expect(html).toContain("app.example.com/stock");
    expect(html.match(/role="img"/g)).toHaveLength(1);
    expect(html.indexOf("app.example.com/stock")).toBeLessThan(html.indexOf('role="img"'));
    expect(html).toMatch(/<div aria-hidden="true"[^>]*>(?:(?!<\/div>).)*app\.example\.com\/stock/);
  });

  it("should draw no address in a phone frame, whatever the props say", () => {
    expect(renderToStaticMarkup(<PlaceholderView props={{ frame: "phone", address: "app.example.com/stock" }} emit={emit} />)).not.toContain("app.example.com");
  });

  it("should give a phone frame the portrait ratio and a browser frame the video ratio unless one is set", () => {
    expect(renderToStaticMarkup(<PlaceholderView props={{ frame: "phone" }} emit={emit} />)).toContain("aspect-3/4");
    expect(renderToStaticMarkup(<PlaceholderView props={{ frame: "browser" }} emit={emit} />)).toContain("aspect-video");
    expect(renderToStaticMarkup(<PlaceholderView props={{ frame: "browser", ratio: "wide" }} emit={emit} />)).toContain("aspect-21/9");
  });

  it("should draw a Placeholder as before when it has no frame, and never frame a logo", () => {
    const plain = renderToStaticMarkup(<PlaceholderView props={{ label: "Hero image" }} emit={emit} />);
    expect(plain).not.toContain("data-frame");
    expect(classesOf(plain)).toEqual(expect.arrayContaining(["border", "border-dashed", "bg-muted", "aspect-video", "rounded-md"]));
    expect(renderToStaticMarkup(<PlaceholderView props={{ frame: "none" }} emit={emit} />)).toBe(renderToStaticMarkup(<PlaceholderView props={{}} emit={emit} />));
    expect(renderToStaticMarkup(<PlaceholderView props={{ variant: "logo", frame: "browser" }} emit={emit} />)).not.toContain("data-frame");
  });
});

describe("a Table column of check marks", () => {
  const table = (rows: Record<string, string | number | boolean | null>[]) =>
    renderToStaticMarkup(<TableView props={{ columns: [{ key: "feature", label: "Feature" }, { key: "ok", label: "Included", format: "check" }], rows }} emit={emit} />);

  it("should draw true as a check and false as a dash, each read out as Yes or No", () => {
    const html = table([{ feature: "Themes", ok: true }, { feature: "Audit log", ok: false }]);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-check="yes"[^>]*>.*?<\/svg><span class="sr-only">Yes<\/span>/);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-check="no"[^>]*>.*?<\/svg><span class="sr-only">No<\/span>/);
  });

  it("should center a check column and its heading unless the column sets an alignment", () => {
    const html = table([{ feature: "Themes", ok: true }]);
    expect(html).toMatch(/<th scope="col" class="[^"]*text-center[^"]*"><span[^>]*>Included/);
    expect(html).toMatch(/<td class="[^"]*text-center[^"]*"><svg/);
  });

  it("should show text, numbers, and empty cells in a check column as a plain column does", () => {
    const html = table([{ feature: "Seats", ok: "Up to 3" }, { feature: "Price", ok: 25 }, { feature: "Later", ok: null }]);
    expect(html).not.toContain("data-check");
    expect(html).toContain(">Up to 3</td>");
    expect(html).toContain(">25</td>");
    expect(html).toContain(">—</td>");
  });

  it("should keep the words Yes and No in a column without the format", () => {
    const html = renderToStaticMarkup(<TableView props={{ columns: [{ key: "ok", label: "OK" }], rows: [{ ok: true }, { ok: false }] }} emit={emit} />);
    expect(html).not.toContain("data-check");
    expect(html).toContain(">Yes</td>");
    expect(html).toContain(">No</td>");
  });
});

describe("the toggleState action", () => {
  function store(initial: Record<string, unknown>): StateAccess & { values: Record<string, unknown> } {
    const values = { ...initial };
    return { values, get: (path) => values[path], set: (path, value) => { values[path] = value; } };
  }

  it("should turn a false or unset value true, and a true value false", () => {
    const state = store({ "/open": false });
    toggleState(state, { statePath: "/open" });
    expect(state.values["/open"]).toBe(true);
    toggleState(state, { statePath: "/open" });
    expect(state.values["/open"]).toBe(false);
    toggleState(state, { statePath: "/menu" });
    expect(state.values["/menu"]).toBe(true);
  });

  it("should turn a value that is not a boolean true when it is toggled", () => {
    const state = store({ "/open": "no" });
    toggleState(state, { statePath: "/open" });
    expect(state.values["/open"]).toBe(true);
  });

  it("should change nothing when the path is missing or not a string, or the state is not connected", () => {
    const state = store({ "/open": false });
    toggleState(state, {});
    toggleState(state, { statePath: 4 });
    toggleState(state, { statePath: "" });
    expect(state.values).toEqual({ "/open": false });
    expect(() => { toggleState(null, { statePath: "/open" }); }).not.toThrow();
  });
});
