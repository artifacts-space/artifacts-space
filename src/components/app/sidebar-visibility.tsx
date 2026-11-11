"use client";

import { IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { createContext, use, useMemo, useState, type RefObject } from "react";
import { flushSync } from "react-dom";

/** Whether the sidebar is hidden, and how to bring it back: read by the artifact pane's top bar. */
export interface SidebarVisibility {
  hidden: boolean;
  show: () => void;
}

const SidebarVisibilityContext = createContext<SidebarVisibility | null>(null);

/** Provides the sidebar's visibility to the artifact pane. */
export const SidebarVisibilityProvider = SidebarVisibilityContext;

/** Marks the Hide and Show buttons, so focus can move from one to the other. */
export const hideSidebarSlot = "hide-sidebar";
const showSidebarSlot = "show-sidebar";

/**
 * The sidebar's hidden state, per visit. Hiding moves focus to the pane's
 * Show button and showing moves it back to Hide, so a keyboard or screen
 * reader user is never dropped on the page's body when the button they
 * pressed goes away.
 */
export function useSidebarToggle(shell: RefObject<HTMLElement | null>, sidebar: RefObject<HTMLElement | null>) {
  const [hidden, setHidden] = useState(false);
  const visibility = useMemo<SidebarVisibility>(() => ({
    hidden,
    show: () => {
      flushSync(() => { setHidden(false); });
      sidebar.current?.querySelector<HTMLElement>(`[data-slot=${hideSidebarSlot}]`)?.focus();
    },
  }), [hidden, sidebar]);
  function hide() {
    flushSync(() => { setHidden(true); });
    shell.current?.querySelector<HTMLElement>(`[data-slot=${showSidebarSlot}]`)?.focus();
  }
  return { hidden, hide, visibility };
}

/**
 * The button at the start of the artifact pane's top bar that brings a hidden
 * sidebar back, from lg up. Nothing when the sidebar shows or outside the
 * workspace.
 */
export function ShowSidebarButton() {
  const visibility = use(SidebarVisibilityContext);
  if (!visibility?.hidden) return null;
  return (
    <button
      type="button"
      data-slot={showSidebarSlot}
      aria-label="Show the sidebar"
      title="Show the sidebar"
      onClick={visibility.show}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none max-lg:hidden"
    >
      <IconLayoutSidebarLeftExpand aria-hidden className="size-4" />
    </button>
  );
}
