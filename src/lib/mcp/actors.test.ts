import { describe, expect, it } from "vitest";

import { actorOf, listPeople, toMcpActor } from "./actors";

describe("toMcpActor", () => {
  const ada = { handle: "ada", kind: "person" as const, name: "Ada Lovelace", ownerName: null };
  const bot = { handle: "claude-code", kind: "agent" as const, name: "Claude Code", ownerName: "Charles" };

  it("should give a teammate's name, labelled untrusted", () => {
    expect(toMcpActor(ada, true)).toEqual({ handle: "ada", kind: "person", name: { untrustedText: "Ada Lovelace" } });
  });

  it("should leave the name out for someone outside the caller's teams who has a handle", () => {
    expect(toMcpActor(ada, false)).toEqual({ handle: "ada", kind: "person" });
  });

  it("should give the name of someone without a handle to everyone, as the label shows it", () => {
    expect(toMcpActor({ ...ada, handle: null }, false)).toEqual({ handle: null, kind: "person", name: { untrustedText: "Ada Lovelace" } });
  });

  it("should credit an agent to the person who added it for every caller, as its label does", () => {
    expect(toMcpActor(bot, false)).toEqual({ handle: "claude-code", kind: "agent", for: { untrustedText: "Charles" } });
    expect(toMcpActor({ ...bot, ownerName: null }, false)).toEqual({ handle: "claude-code", kind: "agent" });
  });

  it("should never credit a person to an owner", () => {
    expect(toMcpActor({ ...ada, ownerName: "Someone" }, true)).not.toHaveProperty("for");
  });
});

describe("actorOf", () => {
  it("should read null when the id is unset or the actor is gone", () => {
    const actors = new Map([["u1", { handle: "ada", kind: "person" as const }]]);
    expect(actorOf(actors, "u1")).toEqual({ handle: "ada", kind: "person" });
    expect(actorOf(actors, "gone")).toBeNull();
    expect(actorOf(actors, null)).toBeNull();
  });
});

describe("listPeople", () => {
  const actors = new Map([
    ["u1", { handle: "ada", kind: "person" as const, name: { untrustedText: "Ada" } }],
    ["u2", { handle: "bot", kind: "agent" as const, for: { untrustedText: "Charles" } }],
    ["u3", { handle: "hidden", kind: "person" as const, name: { untrustedText: "Hidden Person" } }],
  ]);

  it("should give each person the rows name once, in full, keyed by handle", () => {
    const shown = [{ handle: "ada", kind: "person" as const }, { handle: "bot", kind: "agent" as const }, { handle: "ada", kind: "person" as const }, null];
    expect(listPeople(shown, actors)).toEqual({ ada: { kind: "person", name: { untrustedText: "Ada" } }, bot: { kind: "agent", for: { untrustedText: "Charles" } } });
  });

  it("should name nobody the rows leave out, though their actor was loaded", () => {
    expect(listPeople([{ handle: "ada", kind: "person" }], actors)).not.toHaveProperty("hidden");
  });

  it("should list a person whose handle is also the name of an object's built-in property", () => {
    const tricky = new Map(["constructor", "tostring", "hasownproperty", "valueof"].map((handle) => [handle, { handle, kind: "person" as const, name: { untrustedText: handle } }]));
    const shown = [...tricky.values()].map(({ handle, kind }) => ({ handle, kind }));
    const people = listPeople(shown, tricky);
    expect(Object.keys(people)).toEqual(["constructor", "tostring", "hasownproperty", "valueof"]);
    expect(Object.hasOwn(people, "constructor")).toBe(true);
    expect(JSON.parse(JSON.stringify(people))).toEqual(people);
  });

  it("should leave out someone without a handle, whom the row already names in full", () => {
    expect(listPeople([{ handle: null, kind: "person", name: { untrustedText: "No Handle" } }], actors)).toEqual({});
  });
});
