import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AGENT_SAVE_NOTICE, AgentSaveNotice, openHistoryButton } from "./save-status";

const noop = () => undefined;

describe("AgentSaveNotice", () => {
  it("should say the person's version is saved and the agent's is in History when an agent saved in between", () => {
    const html = renderToStaticMarkup(<AgentSaveNotice show onDismiss={noop} history={openHistoryButton(noop)} />);
    expect(AGENT_SAVE_NOTICE).toBe("An agent saved changes while you were editing. Your version is saved; theirs is in History.");
    expect(html).toContain(AGENT_SAVE_NOTICE);
    expect(html).toContain("Open History");
    expect(html).toContain("Dismiss");
    expect(html).toContain('role="status"');
  });

  it("should render nothing when no agent saved in between", () => {
    expect(renderToStaticMarkup(<AgentSaveNotice show={false} onDismiss={noop} />)).toBe("");
  });
});
