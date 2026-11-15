import { describe, expect, it } from "vitest";

import { avatarGroupName, avatarGroupShape, kbdWords, ratingWords } from "./display-words";

const named = (...names: string[]) => names.map((name) => ({ name }));

describe("avatarGroupName", () => {
  it("should list every name when all of them are drawn", () => {
    expect(avatarGroupName(named("Maya Chen", "Omar Haddad", "Priya Nair"))).toBe("3 people: Maya Chen, Omar Haddad, and Priya Nair");
  });

  it("should name the people drawn and count the rest when there are more than max", () => {
    expect(avatarGroupName(named("A", "B", "C", "D", "E"), 3)).toBe("5 people: A, B, C, and 2 more");
  });

  it("should count everyone in total when the list is a sample of a larger group", () => {
    expect(avatarGroupName(named("A", "B"), 5, 2400)).toBe("2,400 people: A, B, and 2,398 more");
  });

  it("should say person, not people, when the group is one person", () => {
    expect(avatarGroupName(named("Maya Chen"))).toBe("1 person: Maya Chen");
  });

  it("should draw five circles by default and count the rest", () => {
    const shape = avatarGroupShape(named("A", "B", "C", "D", "E", "F", "G"));
    expect(shape.shown.map((person) => person.name)).toEqual(["A", "B", "C", "D", "E"]);
    expect(shape.more).toBe(2);
  });
});

describe("kbdWords", () => {
  it("should read symbols and short forms as words and other keys as written", () => {
    expect(kbdWords(["⌘", "K"])).toBe("Command K");
    expect(kbdWords(["Ctrl", "⇧", "P"])).toBe("Control Shift P");
    expect(kbdWords(["esc"])).toBe("Escape");
    expect(kbdWords(["F5"])).toBe("F5");
  });
});

describe("ratingWords", () => {
  it("should say the score out of the stars, after the label when there is one", () => {
    expect(ratingWords(4.5)).toBe("4.5 out of 5");
    expect(ratingWords(3, 10)).toBe("3 out of 10");
    expect(ratingWords(4.5, 5, "Average rating")).toBe("Average rating: 4.5 out of 5");
  });
});
