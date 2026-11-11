import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "@/components/ui/dialog";
import { FEEDBACK_NOTE_MAX_LENGTH } from "@/lib/feedback/feedback-rules";

vi.mock("@/app/(workspace)/feedback-actions", () => ({ sendFeedbackAction: vi.fn() }));

const { FeedbackForm } = await import("./feedback-dialog");

/*
 * The "Something's not working" form, rendered as HTML. Typing and sending
 * are covered end to end in e2e/feedback.spec.ts on the workspace fixture.
 */

function render(note = "") {
  return renderToStaticMarkup(
    <Dialog open>
      <FeedbackForm note={note} onNoteChange={vi.fn()} send={vi.fn()} onSent={vi.fn()} />
    </Dialog>,
  );
}

describe("FeedbackForm", () => {
  it("should turn off browser validation so errors show in the dialog", () => {
    const html = render();
    expect(html).toMatch(/<form[^>]*novalidate/i);
    expect(html).not.toMatch(/<textarea[^>]*\b(required|maxlength)\b/i);
  });

  it("should ask what went wrong with a labelled text box when it opens", () => {
    const html = render();
    expect(html).toContain('<label');
    expect(html).toContain('for="feedback-note"');
    expect(html).toContain("What went wrong?");
    expect(html).toMatch(/<textarea[^>]*id="feedback-note"/);
  });

  it("should put the question and the text box above the buttons", () => {
    const html = render();
    const send = html.search(/Send<\/button>/);
    expect(send).toBeGreaterThan(0);
    expect(html.indexOf("What went wrong?")).toBeLessThan(send);
    expect(html.indexOf("<textarea")).toBeLessThan(html.indexOf("Cancel</button>"));
  });

  it("should make both buttons 44px tall on phones", () => {
    const buttons = render().match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toContain("max-sm:h-11");
  });

  it("should show no count when the note is short", () => {
    expect(render("It broke.")).not.toContain("characters");
  });

  it("should show the count when the note nears the limit", () => {
    expect(render("x".repeat(FEEDBACK_NOTE_MAX_LENGTH - 10))).toContain("1,990 of 2,000 characters");
  });

  it("should keep the typed note in the box when it renders again", () => {
    expect(render("The Save button does nothing.")).toContain("The Save button does nothing.</textarea>");
  });
});
