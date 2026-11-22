/**
 * The tools over a code block (the language, Copy, and in the editor the
 * pickers, Wrap code, and Caption): a small bar at the block's top right,
 * drawn over the code. It shows while the block is hovered or holds focus,
 * while one of its menus is open (the menu's trigger says
 * `aria-expanded="true"`; the menu itself is drawn outside the block), and
 * always on touch screens, which have no hover. It fades with opacity only,
 * so its controls stay in the tab order and reachable by keyboard. While
 * hidden it takes no presses (pointer-events), so a press that lands there
 * before the fade, such as a tap on a touch laptop whose main pointer is a
 * mouse, starts a selection in the code instead of pressing Copy.
 *
 * The bar is painted with the page color: it differs from the block's fill
 * (--code) and from the card a diagram is drawn on, so it reads on both,
 * and neither is --muted, the buttons' hover fill (--code is --muted's own
 * step, so a --code bar would hide it). On a touch screen the bar never
 * hides, so the code starts below it there (`codeClearsToolsClass`, the
 * editor's pre in globals.css, and the diagram side of a Mermaid block):
 * the first line is never covered or hit by a tap.
 *
 * The block's root carries `group/code` and `relative`. Shared by the read
 * view (`CodeBlock`) and the editor (`CodeBlockToolbar`), so both look alike.
 */
export const codeToolsClass = [
  "absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-code-border bg-background p-0.5 shadow-xs",
  "pointer-events-none opacity-0 transition-opacity motion-reduce:transition-none",
  "group-hover/code:pointer-events-auto group-hover/code:opacity-100",
  "group-focus-within/code:pointer-events-auto group-focus-within/code:opacity-100",
  "has-[[aria-expanded=true]]:pointer-events-auto has-[[aria-expanded=true]]:opacity-100",
  "pointer-coarse:pointer-events-auto pointer-coarse:opacity-100",
].join(" ");

/** The top padding that puts an untitled block's code below its tools where they always show (touch screens). */
export const codeClearsToolsClass = "pointer-coarse:pt-11";
