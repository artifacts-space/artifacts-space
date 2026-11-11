import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MenuContext } from "./block-actions";
import { MenuList } from "./block-menu";
import { ChangeSubmenu, MenuFooter, SearchRow } from "./block-menu-parts";
import { menuReducer, openedMenu, rowsFor, type MenuState } from "./block-menu-state";

const context: MenuContext = { changeable: true, currentType: "h2", canMoveUp: true, canMoveDown: false, canLink: true, canComment: true };
const noop = () => undefined;

function list(state: MenuState) {
  return renderToStaticMarkup(
    <MenuList menuId="m" typeName="Heading 2" rows={rowsFor(state, context)} state={state} mac onChangeRow={noop} onHover={noop} onChoose={noop} />,
  );
}

function search(state: MenuState) {
  return renderToStaticMarkup(<SearchRow inputRef={createRef()} value={state.query} menuId="m" activeId={state.active >= 0 ? `m-row-${String(state.active)}` : undefined} onChange={noop} />);
}

describe("the block menu", () => {
  it("should open with no row highlighted and no active descendant", () => {
    expect(list(openedMenu)).not.toContain('data-highlighted=""');
    expect(search(openedMenu)).not.toContain("aria-activedescendant");
  });

  it("should be a labelled menu of menu items, with the block's type over the first group", () => {
    const html = list(openedMenu);
    expect(html).toContain('role="menu" aria-label="Heading 2 block"');
    expect(html.match(/role="menuitem"/g)).toHaveLength(7);
    expect(html).toContain('aria-haspopup="menu" aria-expanded="false"');
    expect(html.match(/role="separator"/g)).toHaveLength(2);
    expect(html).toContain(">Heading 2</div>");
  });

  it("should show shortcuts and mark Move down as unavailable on the last block", () => {
    const html = list(openedMenu);
    expect(html).toContain("⌘D");
    expect(html).toContain("⌘⇧M");
    expect(html).toMatch(/aria-disabled="true"[^>]*>.*?Move down/);
  });

  it("should highlight the first match and point the search at it when text is typed", () => {
    const typed = menuReducer(openedMenu, { type: "typed", query: "heading 1" }, context);
    expect(list(typed)).toMatch(/id="m-row-0"[^>]*data-highlighted=""/);
    expect(list(typed)).toContain("Change to Heading 1");
    expect(list(typed)).not.toContain(">Heading 2</div>");
    expect(search(typed)).toContain('aria-activedescendant="m-row-0"');
  });

  it("should keep the search field bare, with the placeholder the design asks for", () => {
    const html = search(openedMenu);
    expect(html).toContain('placeholder="Search actions…"');
    expect(html).toContain("border-0");
    expect(html).toContain("ring-0");
    expect(html).toContain("bg-transparent");
  });

  it("should check the block's current type in Change", () => {
    const html = renderToStaticMarkup(<ChangeSubmenu panelRef={createRef()} className="" currentType="h2" focused={false} sheet={false} onPick={noop} onBack={noop} onCloseAll={noop} />);
    expect(html.match(/role="menuitemradio"/g)).toHaveLength(9);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true"[^>]*>.*?Heading 2/);
  });

  it("should show who edited last and the block's size in the footer", () => {
    const html = renderToStaticMarkup(
      <MenuFooter lastEdited={{ editor: { id: "u1", kind: "person", handle: "charles", name: "Charles" }, at: new Date().toISOString(), harness: { id: "claude-code", stamped: "claude-code", overridden: false } }} words={3} characters={16} />,
    );
    expect(html).toContain("Last edited");
    expect(html).toContain("@charles");
    expect(html).toContain("Claude Code");
    expect(html).toContain("Today at");
    expect(html).toContain("3 words, 16 characters");
  });
});
