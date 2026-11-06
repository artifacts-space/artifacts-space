import { describe, expect, it } from "vitest";

import { agentCountLabel, headcountFor, peopleCountLabel } from "./member-counts";

describe("peopleCountLabel", () => {
  it("should use the singular when the team has one person", () => {
    expect(peopleCountLabel(1)).toBe("1 member");
  });

  it("should use the plural when the team has zero or several people", () => {
    expect(peopleCountLabel(0)).toBe("0 members");
    expect(peopleCountLabel(3)).toBe("3 members");
  });
});

describe("agentCountLabel", () => {
  it("should be empty when the team has no agents", () => {
    expect(agentCountLabel(0)).toBe("");
  });

  it("should count agents when the team has some", () => {
    expect(agentCountLabel(1)).toBe("1 agent");
    expect(agentCountLabel(2)).toBe("2 agents");
  });
});

describe("headcountFor", () => {
  it("should return zero of each when the team has no rows", () => {
    expect(headcountFor(new Map(), "t1")).toEqual({ people: 0, agents: 0 });
  });

  it("should return the team's counts when it has rows", () => {
    expect(headcountFor(new Map([["t1", { people: 3, agents: 2 }]]), "t1")).toEqual({ people: 3, agents: 2 });
  });
});
