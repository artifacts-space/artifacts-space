import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EditorLiveRegion } from "./editor-live-region";

describe("EditorLiveRegion", () => {
  it("should draw one empty live region after the editor, never inside it, when it renders", () => {
    const html = renderToStaticMarkup(<EditorLiveRegion><div data-text="">The text</div></EditorLiveRegion>);
    expect(html).toBe('<div data-text="">The text</div><div aria-live="polite" aria-atomic="true" data-editor-live-region="" data-comment-skip="" class="sr-only"></div>');
  });
});
