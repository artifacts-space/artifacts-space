/**
 * The tools over a code block (the language, Copy, and in the editor the
 * pickers, Wrap code, and Caption): a small bar at the block's top right,
 * drawn over the code. It shows while the block is hovered or holds focus,
 * while one of its menus is open (the menu's trigger says
 * `aria-expanded="true"`; the menu itself is drawn outside the block), and
 * always on touch screens, which have no hover. It fades with opacity only,
 * so its controls stay in the tab order and reachable by keyboard.
 *
 * The bar is painted with the card, not the block's fill: --code is the
 * same step as --muted, so on a --code bar the buttons' hover fill
 * (bg-muted) would not show. On a touch screen the bar never hides, so the
 * code starts below it there (`codeClearsToolsClass`, and the editor's pre
 * in globals.css): the first line is never covered or hit by a tap.
 *
 * The block's root carries `group/code` and `relative`. Shared by the read
 * view (`CodeBlock`) and the editor (`CodeBlockToolbar`), so both look alike.
 */
export const codeToolsClass = [
  "absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-code-border bg-card p-0.5",
  "opacity-0 transition-opacity motion-reduce:transition-none",
  "group-hover/code:opacity-100 group-focus-within/code:opacity-100 has-[[aria-expanded=true]]:opacity-100 pointer-coarse:opacity-100",
].join(" ");

/** The top padding that puts an untitled block's code below its tools where they always show (touch screens). */
export const codeClearsToolsClass = "pointer-coarse:pt-11";
