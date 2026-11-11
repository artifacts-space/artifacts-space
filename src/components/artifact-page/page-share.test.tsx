import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ShareableArtifactDto } from "@/lib/artifact-types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The dialog's server actions are never called here; stub the module so no server code loads.
vi.mock("@/app/(workspace)/app/sharing-actions", () => ({ shareArtifactAction: vi.fn(), setCommentsAction: vi.fn(), setShowInSearchAction: vi.fn() }));

const { ArtifactHeader } = await import("./artifact-header");
const { ArtifactPageShare, shareStatusText } = await import("./page-share");

const artifact: ShareableArtifactDto = {
  id: "artifact-1",
  publicId: "4fXkP9qR2sT7vW1yZ3aB5c",
  title: "Release plan",
  icon: null,
  visibility: "private",
  teamId: null,
  comments: "off",
  showInSearch: false,
  pendingSharing: null,
  pendingEdit: null,
  pendingComments: null,
};
const sentence = "Private. Only you can see this.";

function header(share: ShareableArtifactDto | null) {
  const button = share ? <ArtifactPageShare artifact={share} teams={[]} sentence={sentence} shareUrl="https://artifacts.space/artifact/x" /> : null;
  return renderToStaticMarkup(<ArtifactHeader visibility={artifact.visibility} sentence={sentence} content="# Release plan" share={button} />);
}

describe("shareStatusText", () => {
  it("should name the level and Share settings when nothing waits", () => {
    expect(shareStatusText("team", false)).toEqual({ label: "Team", name: "Team. Share settings" });
  });

  it("should say Pending when a change waits for approval", () => {
    expect(shareStatusText("private", true)).toEqual({ label: "Pending", name: "Pending. Share settings" });
  });
});

describe("ArtifactHeader with Share", () => {
  it("should turn the status into a Share settings button when the viewer may share", () => {
    const html = header(artifact);
    expect(html).toContain('aria-label="Private. Share settings"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain(`aria-label="${sentence}"`);
  });

  it("should show Pending when a sharing request waits", () => {
    const html = header({ ...artifact, pendingSharing: { requestId: "r", level: "team", teamId: "t", comments: null, requestedAt: "2026-11-11T12:00:00.000Z" } });
    expect(html).toContain('aria-label="Pending. Share settings"');
    expect(html).toContain('data-pending="true"');
  });

  it("should keep the read-only status and no Share settings when the viewer may not share", () => {
    const html = header(null);
    expect(html).toContain(`aria-label="${sentence}"`);
    expect(html).not.toContain("Share settings");
  });
});
