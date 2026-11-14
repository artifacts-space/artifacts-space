"use client";

import { useRef, type ReactNode } from "react";

import { scrollStopProps } from "@/components/code/scroll-stop";
import { useScrollable } from "@/components/code/use-scrollable";
import { cn } from "@/lib/utils";

/**
 * A box that scrolls sideways when its content is wider, such as a docs
 * table on a phone. While it actually scrolls it is a named group and a tab
 * stop, so the keyboard can scroll it too, as code blocks do (scroll-stop.ts).
 */
export function ScrollFrame({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollable = useScrollable(ref);
  return (
    <div ref={ref} {...scrollStopProps(scrollable, { label })} className={cn("outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset", className)}>
      {children}
    </div>
  );
}
