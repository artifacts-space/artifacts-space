import { describe, expect, it } from "vitest";

import { showTeamWelcome, TEAM_WELCOME_DAYS, type TeamWelcomeFacts } from "./welcome-rules";

const now = new Date("2026-11-11T12:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const facts = (overrides: Partial<TeamWelcomeFacts> = {}): TeamWelcomeFacts => ({
  userId: "member-1",
  personal: false,
  createdBy: "owner-1",
  joinedAt: daysAgo(0),
  dismissed: false,
  ...overrides,
});

describe("showTeamWelcome", () => {
  it("should show the card when a person just joined someone else's team", () => {
    expect(showTeamWelcome(facts(), now)).toBe(true);
  });

  it("should keep showing the card on later visits when the member has not closed it", () => {
    expect(showTeamWelcome(facts({ joinedAt: daysAgo(TEAM_WELCOME_DAYS - 1) }), now)).toBe(true);
  });

  it("should hide the card when the member closed it", () => {
    expect(showTeamWelcome(facts({ dismissed: true }), now)).toBe(false);
  });

  it("should hide the card when the member joined before the welcome window", () => {
    expect(showTeamWelcome(facts({ joinedAt: daysAgo(TEAM_WELCOME_DAYS) }), now)).toBe(false);
    expect(showTeamWelcome(facts({ joinedAt: daysAgo(400) }), now)).toBe(false);
  });

  it("should hide the card when the viewer created the team", () => {
    expect(showTeamWelcome(facts({ createdBy: "member-1" }), now)).toBe(false);
  });

  it("should show the card when the team's creator account is gone", () => {
    expect(showTeamWelcome(facts({ createdBy: null }), now)).toBe(true);
  });

  it("should hide the card when the team is the member's personal team", () => {
    expect(showTeamWelcome(facts({ personal: true }), now)).toBe(false);
  });
});
