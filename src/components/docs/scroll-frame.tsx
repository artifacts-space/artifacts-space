"use client";

import { useRef, type ReactNode } from "react";

import { useScrollable } from "@/components/code/use-scrollable";
import { cn } from "@/lib/utils";

/**
 * A box that scrolls sideways when its content is wider, such as a docs
 * table on a phone. While it actually scrolls it is a named region and a tab
 * stop, so the keyboard can scroll it too, as code blocks do.
 */
export function ScrollFrame({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollable = useScrollable(ref);
  const region = scrollable ? ({ tabIndex: 0, role: "region", "aria-label": label } as const) : {};
  return (
    <div ref={ref} {...region} className={cn("outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset", className)}>
      {children}
    </div>
  );
}
