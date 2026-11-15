import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactView } from "../artifact-view";

/*
 * A Checkbox or Switch is a span with a role, so the <label> around it names
 * it only once the browser has run. These read the server's HTML, where a
 * screen reader, or a scan that runs before React takes over, must already
 * find the name.
 */

function one(type: string, props: Record<string, unknown>): string {
  return renderToStaticMarkup(<ArtifactView kind="ui" content={JSON.stringify({ version: 1, root: "e", elements: { e: { type, props } } })} title="Test" />);
}

/** The words each control with `role` points at with `aria-labelledby`, in order; "unnamed" for one that points at nothing. */
function namesOf(html: string, role: string): string[] {
  const controls = html.match(new RegExp(`<[a-z]+\\b[^>]*role="${role}"[^>]*>`, "g")) ?? [];
  return controls.map((control) => {
    const id = /aria-labelledby="([^"]+)"/.exec(control)?.[1];
    if (id === undefined) return "unnamed";
    const start = html.indexOf(`id="${id}"`);
    if (start === -1) return "unnamed";
    const words = /^[^>]*>((?:<span[^>]*>[^<]*<\/span>|[^<])*)/.exec(html.slice(start))?.[1] ?? "";
    return words.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  });
}

describe("toggle names in the server's HTML", () => {
  it("should name a Switch by its label and description before the browser runs", () => {
    expect(namesOf(one("Switch", { label: "Bill yearly", description: "Two months free." }), "switch")).toEqual(["Bill yearly Two months free."]);
    expect(namesOf(one("Switch", { label: "Push alerts" }), "switch")).toEqual(["Push alerts"]);
  });

  it("should name a Checkbox by its label and description before the browser runs", () => {
    expect(namesOf(one("Checkbox", { label: "Keep me signed in", description: "On this device." }), "checkbox")).toEqual(["Keep me signed in On this device."]);
  });

  it("should name each box of a Checklist by its own item before the browser runs", () => {
    const html = one("Checklist", { title: "Launch", items: [{ label: "Write the notes" }, { label: "Tell the team", checked: true }] });
    expect(namesOf(html, "checkbox")).toEqual(["Write the notes", "Tell the team"]);
  });

  it("should give two switches on one page different label ids", () => {
    const html = renderToStaticMarkup(
      <ArtifactView kind="ui" title="Test" content={JSON.stringify({ version: 1, root: "box", elements: { box: { type: "Stack", props: {}, children: ["a", "b"] }, a: { type: "Switch", props: { label: "First" } }, b: { type: "Switch", props: { label: "Second" } } } })} />,
    );
    expect(namesOf(html, "switch")).toEqual(["First", "Second"]);
  });
});
