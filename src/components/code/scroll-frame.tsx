"use client";

import { useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { scrollStopProps, scrollStopRing } from "./scroll-stop";
import { useScrollable } from "./use-scrollable";

/**
 * A box that scrolls when its content is larger, such as a docs table on a
 * phone or a long source listing. While it actually scrolls it is a named
 * group and a tab stop, so the keyboard can scroll it too, as code blocks do
 * (scroll-stop.ts). Give it the overflow and size classes in `className`.
 */
export function ScrollFrame({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollable = useScrollable(ref);
  return (
    <div ref={ref} {...scrollStopProps(scrollable, { label })} className={cn(scrollStopRing, className)}>
      {children}
    </div>
  );
}
