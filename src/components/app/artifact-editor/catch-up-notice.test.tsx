import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CatchUpNotice, openHistoryButton } from "./save-status";
import { describeCatchUp } from "./use-catch-up";

const noop = () => undefined;
const frame = (id: string, name: string, text: string) => ({ id, name, width: 390, spec: { version: 1, root: "page", elements: { page: { type: "Text", props: { text } } } } });
const canvas = (frames: unknown[]) => JSON.stringify({ version: 1, frames });

describe("CatchUpNotice", () => {
  it("should say who changed what, with a way into History and a way to dismiss it", () => {
    const html = renderToStaticMarkup(<CatchUpNotice words={'Claude Code changed the frame "Pricing". It is outlined below.'} onDismiss={noop} history={openHistoryButton(noop)} />);
    expect(html).toContain("Claude Code changed the frame &quot;Pricing&quot;. It is outlined below.");
    expect(html).toContain("Open History");
    expect(html).toContain("Dismiss");
    expect(html).toContain('role="status"');
  });

  it("should render nothing when the editor took no newer save", () => {
    expect(renderToStaticMarkup(<CatchUpNotice words={null} onDismiss={noop} />)).toBe("");
  });

  it("should show a frame's name as text, never as markup", () => {
    const html = renderToStaticMarkup(<CatchUpNotice words={'Claude Code changed the frame "<img src=x onerror=alert(1)>". It is outlined below.'} onDismiss={noop} />);
    expect(html).not.toContain("<img");
  });
});

describe("describeCatchUp", () => {
  const changedBy = { handle: "ann", harness: { id: "claude-code" as const, name: "Claude Code" } };

  it("should mark the frames of a canvas that the newer save changed", () => {
    const shown = { content: canvas([frame("home", "Home", "Welcome"), frame("pricing", "Pricing", "Plans")]) };
    const artifact = { id: "artifact-1", kind: "canvas", content: canvas([frame("home", "Home", "Welcome"), frame("pricing", "Pricing", "New plans")]) };
    const note = describeCatchUp(shown, { artifact, changedBy } as Parameters<typeof describeCatchUp>[1]);
    expect(note.artifactId).toBe("artifact-1");
    expect([...note.frames]).toEqual(["pricing"]);
    expect(note.words).toBe('Claude Code changed the frame "Pricing". It is outlined below.');
  });

  it("should mark no frames for an interface", () => {
    const note = describeCatchUp({ content: "{}" }, { artifact: { id: "artifact-2", kind: "ui", content: "{}" }, changedBy } as Parameters<typeof describeCatchUp>[1]);
    expect(note.frames.size).toBe(0);
    expect(note.words).toBe("Claude Code changed this interface. This is the new version.");
  });
});
