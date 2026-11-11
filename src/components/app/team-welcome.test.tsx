import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { defaultActor } from "@/lib/teams/capability-rules";

import type { ShareTeam } from "./share-teams-context";

/* The new member's welcome card above a team workspace: what it says, and when it is not there. */

vi.mock("@/app/(workspace)/app/welcome-actions", () => ({ dismissTeamWelcomeAction: vi.fn() }));

const { TeamWelcome } = await import("./team-welcome");

const design: ShareTeam = { id: "t1", slug: "design", name: "Design", personal: false, role: "member", ...defaultActor("member"), teamSharingNeedsApproval: false };
const save = () => Promise.resolve({ success: true as const, data: null });

describe("TeamWelcome", () => {
  it("should lead with what the member can do, then the outside rule, then the actions when the server shows it", () => {
    const html = renderToStaticMarkup(<TeamWelcome team={design} initial dismiss={save} />);
    expect(html).toContain("Welcome to Design");
    const copy = html.indexOf("You can edit the team&#x27;s artifacts right away.");
    const outside = html.indexOf("Sharing by link or in public needs approval");
    const button = html.indexOf("Got it");
    expect(copy).toBeGreaterThan(-1);
    expect(outside).toBeGreaterThan(copy);
    expect(button).toBeGreaterThan(outside);
    expect(html).toContain('href="/teams/design"');
  });

  it("should render nothing when the server hides it", () => {
    expect(renderToStaticMarkup(<TeamWelcome team={design} initial={false} dismiss={save} />)).toBe("");
    expect(renderToStaticMarkup(<TeamWelcome team={design} initial={undefined} dismiss={undefined} />)).toBe("");
  });

  it("should render nothing on the viewer's own workspace", () => {
    expect(renderToStaticMarkup(<TeamWelcome team={null} initial dismiss={save} />)).toBe("");
  });
});
