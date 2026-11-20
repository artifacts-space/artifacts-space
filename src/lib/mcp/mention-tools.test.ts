import { describe, expect, it } from "vitest";

import { refusalMessage } from "@/lib/comments/rules";

import { toMcpMentions } from "./mention-tools";

describe("toMcpMentions", () => {
  it("should give a refused mention of an unknown handle a next step that names teams_list", () => {
    const outcome = toMcpMentions({ notified: [], refused: [{ handle: "ada", reason: "not_visible", message: refusalMessage("ada", "not_visible") }] });
    expect(outcome.refused[0]).toMatchObject({ reason: "not_visible", next: expect.stringContaining("teams_list") as unknown });
  });

  it("should tell an agent to share the artifact first when a teammate cannot see it, and never that agents approve", () => {
    const [refused] = toMcpMentions({ notified: [], refused: [{ handle: "ada", reason: "cannot_see", message: refusalMessage("ada", "cannot_see") }] }).refused;
    expect(refused?.next).toMatch(/Share the artifact with their team first/);
    expect(refused?.next).toMatch(/agents never approve/);
  });

  it("should keep notified mentions and refusals without a next step as they are", () => {
    const muted = { handle: "bot", reason: "muted" as const, message: refusalMessage("bot", "muted") };
    expect(toMcpMentions({ notified: [{ handle: "ada", kind: "person" }], refused: [muted] })).toEqual({ notified: [{ handle: "ada", kind: "person" }], refused: [muted] });
  });
});
