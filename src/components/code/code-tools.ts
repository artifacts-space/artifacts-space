/**
 * The tools over a code block (the language, Copy, and in the editor the
 * pickers, Wrap code, and Caption): a small bar at the block's top right,
 * drawn over the code. It shows while the block is hovered or holds focus,
 * while one of its menus is open (the menu's trigger says
 * `aria-expanded="true"`; the menu itself is drawn outside the block), and
 * always on touch screens, which have no hover. It fades with opacity only,
 * so its controls stay in the tab order and reachable by keyboard.
 *
 * The block's root carries `group/code` and `relative`. Shared by the read
 * view (`CodeBlock`) and the editor (`CodeBlockToolbar`), so both look alike.
 */
export const codeToolsClass = [
  "absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-code-border bg-code p-0.5",
  "opacity-0 transition-opacity motion-reduce:transition-none",
  "group-hover/code:opacity-100 group-focus-within/code:opacity-100 has-[[aria-expanded=true]]:opacity-100 pointer-coarse:opacity-100",
].join(" ");
