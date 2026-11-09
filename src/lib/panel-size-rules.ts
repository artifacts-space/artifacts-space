/**
 * Size rules for the /app workspace's resizable panels: the sidebar's width
 * and the height of its Projects group. Pure, so the bounds, keys, and stored
 * values can be tested without a browser. The CSS in the dashboard mirrors
 * these bounds so a stored size never draws outside them.
 */

/** The smallest and largest size a panel may take, in pixels. */
export interface SizeBounds {
  min: number;
  max: number;
}

/** One resizable panel: where its size is kept and how far it may go. */
export interface PanelSpec {
  /** The localStorage key that remembers the viewer's size. */
  storageKey: string;
  /** The CSS custom property, set on the root element, that the layout reads. */
  cssVar: string;
  /** The size when nothing is stored, and after a double-click reset. */
  defaultSize: number;
  /** The smallest size: the panel's content still fits. */
  min: number;
}

/**
 * The sidebar: wide enough at its minimum for the format and project
 * filters side by side and a card's title with its date, and never so wide
 * that the artifact pane drops under `contentMin`.
 */
export const sidebarPanel = {
  storageKey: "artifacts.space:workspace:sidebar-width",
  cssVar: "--workspace-sidebar-width",
  defaultSize: 280,
  min: 272,
  max: 520,
  /** The narrowest the artifact pane may get, so its toolbar and content stay usable. */
  contentMin: 480,
} as const satisfies PanelSpec & { max: number; contentMin: number };

/**
 * The Projects group's rows: at least about two rows, never taller than its
 * rows need, and always leaving `listMin` for the artifact list below it.
 */
export const projectsPanel = {
  storageKey: "artifacts.space:workspace:projects-height",
  cssVar: "--workspace-projects-height",
  defaultSize: 192,
  min: 64,
  /** The shortest the artifact list may get: about two cards. */
  listMin: 120,
} as const satisfies PanelSpec & { listMin: number };

/** Every panel whose size is remembered. */
export const rememberedPanels: readonly PanelSpec[] = [sidebarPanel, projectsPanel];

/**
 * The sidebar column from lg up. The bounds mirror `sidebarPanel` (a unit test checks it), so a
 * stored width never draws the sidebar or the artifact pane past them, even
 * before the handle has measured anything.
 */
export const sidebarColumns = "lg:[grid-template-columns:clamp(272px,var(--workspace-sidebar-width,280px),min(520px,100%_-_480px))_minmax(0,1fr)]";

/** The sidebar handle's place in the workspace card from lg up: the same clamp as `sidebarColumns`, so it sits on the sidebar's edge. */
export const sidebarHandleLeft = "lg:left-[clamp(272px,var(--workspace-sidebar-width,280px),min(520px,100%_-_480px))]";

/** The Projects rows' height from lg up, mirroring `projectsPanel` (a unit test checks it); phones keep the fixed cap. */
export const projectsRowsHeight = "max-h-48 lg:min-h-16 lg:max-h-[var(--workspace-projects-height,192px)]";

/**
 * The artifact list's floor from lg up, so the Projects rows never squeeze it
 * away (`projectsPanel.listMin`). On a window too short for every floor, the
 * sidebar scrolls instead of cutting off its footer.
 */
export const listMinHeight = "lg:min-h-30";

/** One arrow press moves a handle this far; with Shift held, `bigStep`. */
export const step = 16;
export const bigStep = 64;

/** The largest size ever read back from storage; anything bigger is ignored as damaged. */
const largestStored = 4000;

/** Holds a size inside its bounds. When the bounds cross, the minimum wins, as CSS `clamp()` does. */
export function clampSize(size: number, bounds: SizeBounds): number {
  return Math.max(bounds.min, Math.min(size, bounds.max));
}

/** The sidebar's bounds inside a workspace card `shellWidth` pixels wide. */
export function sidebarBounds(shellWidth: number): SizeBounds {
  const { min, max, contentMin } = sidebarPanel;
  return { min, max: Math.max(min, Math.min(max, shellWidth - contentMin)) };
}

/**
 * The Projects rows' bounds. `content` is the rows' full height, and
 * `shared` is the height the rows and the artifact list hold between them.
 */
export function projectsBounds({ content, shared }: { content: number; shared: number }): SizeBounds {
  const { min, listMin } = projectsPanel;
  return { min, max: Math.max(min, Math.min(content, shared - listMin)) };
}

/** Which way a handle moves: a vertical line moves left and right, a horizontal one up and down. */
export type SplitterOrientation = "vertical" | "horizontal";

const grows: Record<SplitterOrientation, string> = { vertical: "ArrowRight", horizontal: "ArrowDown" };
const shrinks: Record<SplitterOrientation, string> = { vertical: "ArrowLeft", horizontal: "ArrowUp" };

/**
 * The size a key press asks for, or null when the key does not resize.
 * Arrows toward the panel's far edge grow it, the others shrink it, Shift
 * takes bigger steps, and Home and End jump to the minimum and maximum.
 */
export function keyboardResize(key: string, shiftKey: boolean, current: number, bounds: SizeBounds, orientation: SplitterOrientation): number | null {
  if (key === "Home") return bounds.min;
  if (key === "End") return bounds.max;
  const amount = shiftKey ? bigStep : step;
  if (key === grows[orientation]) return clampSize(current + amount, bounds);
  if (key === shrinks[orientation]) return clampSize(current - amount, bounds);
  return null;
}

/** True for the key that puts a panel back at its default size, as a double-click does. */
export function isResetKey(key: string): boolean {
  return key === "Enter";
}

/** A size read back from storage, or null when there is none or it is not a sensible pixel size. */
export function parseStoredSize(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const size = Number(raw);
  if (!Number.isFinite(size) || size <= 0 || size > largestStored) return null;
  return Math.round(size);
}

/**
 * A script for the server HTML that applies the stored sizes before the
 * first paint, so the panels open at the viewer's sizes without a jump. It
 * mirrors `parseStoredSize` and ignores storage that cannot be read.
 */
export function beforePaintScript(panels: readonly PanelSpec[] = rememberedPanels): string {
  const entries = JSON.stringify(panels.map((panel) => [panel.storageKey, panel.cssVar]));
  return `try{var s=document.documentElement.style;${entries}.forEach(function(p){var r=localStorage.getItem(p[0]);var v=r===null||r.trim()===""?NaN:Number(r);if(isFinite(v)&&v>0&&v<=${String(largestStored)})s.setProperty(p[1],Math.round(v)+"px")})}catch(e){}`;
}
