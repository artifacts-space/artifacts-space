"use client";

import { IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { createContext, use } from "react";

/** Whether the sidebar is hidden, and how to bring it back: read by the artifact pane's top bar. */
export interface SidebarVisibility {
  hidden: boolean;
  show: () => void;
}

const SidebarVisibilityContext = createContext<SidebarVisibility | null>(null);

/** Provides the sidebar's visibility to the artifact pane. */
export const SidebarVisibilityProvider = SidebarVisibilityContext;

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
      aria-label="Show the sidebar"
      title="Show the sidebar"
      onClick={visibility.show}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none max-lg:hidden"
    >
      <IconLayoutSidebarLeftExpand aria-hidden className="size-4" />
    </button>
  );
}
