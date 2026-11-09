"use client";

import { useLayoutEffect, type RefObject } from "react";

import { PanelSplitter } from "@/components/app/panel-splitter";
import { applyStoredPanelSizes } from "@/components/app/panel-size-storage";
import { beforePaintScript, projectsBounds, projectsPanel, sidebarBounds, sidebarPanel } from "@/lib/panel-size-rules";

/** The ids the handles point at with aria-controls. The workspace renders once per page. */
export const sidebarPanelId = "workspace-sidebar";
export const projectsPanelId = "workspace-projects";

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

/** The handle on the sidebar's right edge, sizing its width against the artifact pane. */
export function SidebarSplitter({ shell, sidebar }: { shell: RefObject<HTMLElement | null>; sidebar: RefObject<HTMLElement | null> }) {
  const measure = () => {
    if (!shell.current || !sidebar.current) return null;
    return { size: Math.round(sidebar.current.getBoundingClientRect().width), bounds: sidebarBounds(shell.current.clientWidth) };
  };
  return (
    <PanelSplitter
      panel={sidebarPanel}
      label="Resize the sidebar"
      controls={sidebarPanelId}
      orientation="vertical"
      measure={measure}
      watch={() => [shell.current, sidebar.current]}
      initial={{ size: sidebarPanel.defaultSize, bounds: { min: sidebarPanel.min, max: sidebarPanel.max } }}
      className="inset-y-0 -right-1 w-2"
    />
  );
}

/** The handle under the Projects rows, trading height between them and the artifact list. */
export function ProjectsSplitter({ rows, list }: { rows: RefObject<HTMLElement | null>; list: RefObject<HTMLElement | null> }) {
  const measure = () => {
    const box = rows.current;
    if (!box || !list.current) return null;
    // Border box sizes, as the CSS max-height is: the rows' top divider counts.
    const size = box.offsetHeight;
    const content = box.scrollHeight + size - box.clientHeight;
    return { size, bounds: projectsBounds({ content, shared: size + list.current.clientHeight }) };
  };
  return (
    <PanelSplitter
      panel={projectsPanel}
      label="Resize the projects"
      controls={projectsPanelId}
      orientation="horizontal"
      measure={measure}
      watch={() => [rows.current, rows.current?.querySelector("ul"), list.current]}
      initial={{ size: projectsPanel.defaultSize, bounds: { min: projectsPanel.min, max: projectsPanel.defaultSize } }}
      className="inset-x-0 -bottom-1 h-2"
    />
  );
}
