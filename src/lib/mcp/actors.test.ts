import { describe, expect, it } from "vitest";

import { actorOf, toMcpActor } from "./actors";

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
