"use client";

import { useLayoutEffect, type RefObject } from "react";

import { PanelSplitter } from "@/components/app/panel-splitter";
import { applyStoredPanelSizes } from "@/components/app/panel-size-storage";
import { beforePaintScript, sidebarBounds, sidebarHandleLeft, sidebarPanel } from "@/lib/panel-size-rules";
import { cn } from "@/lib/utils";

/** The id the handle points at with aria-controls. The workspace renders once per page. */
export const sidebarPanelId = "workspace-sidebar";

const script = beforePaintScript();

/**
 * Applies the viewer's stored panel sizes before the first paint: the inline
 * script runs while the server HTML parses, and the layout effect covers
 * client renders. React never runs a script it creates on the client, so
 * there the script is marked as inert data.
 *
 * The script is inline and has no nonce. The site sends no `script-src`
 * today (`src/lib/security-header-rules.ts`); a policy that adds one must
 * allow this script (a nonce or its hash), or the panels open at their
 * defaults and then jump to the stored sizes once the page hydrates.
 */
export function PanelSizesBeforePaint() {
  useLayoutEffect(() => { applyStoredPanelSizes(); }, []);
  return <script suppressHydrationWarning type={typeof window === "undefined" ? undefined : "text/plain"} dangerouslySetInnerHTML={{ __html: script }} />;
}

/** The handle on the sidebar's right edge, sizing its width against the artifact pane. It sits in the workspace card, not the sidebar. */
export function SidebarSplitter({ sidebar }: { sidebar: RefObject<HTMLElement | null> }) {
  const measure = () => {
    if (!sidebar.current) return null;
    return { size: Math.round(sidebar.current.getBoundingClientRect().width), bounds: sidebarBounds() };
  };
  return (
    <PanelSplitter
      panel={sidebarPanel}
      label="Resize the sidebar"
      controls={sidebarPanelId}
      orientation="vertical"
      measure={measure}
      watch={() => [sidebar.current]}
      initial={{ size: sidebarPanel.defaultSize, bounds: { min: sidebarPanel.min, max: sidebarPanel.max } }}
      // In the workspace card, just past the sidebar's edge: the sidebar can scroll on short windows, and its list's scroll bar stays free.
      className={cn("inset-y-0 w-3", sidebarHandleLeft)}
    />
  );
}
