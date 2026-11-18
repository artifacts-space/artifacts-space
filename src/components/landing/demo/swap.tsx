import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { beat } from "./beat";

/** Two states of one spot: the first leaves as the second lands at `at` seconds. Both hold the spot, so it never changes size. */
export function Swap({ at, before, after, className }: { at: number; before: ReactNode; after: ReactNode; className?: string }) {
  return (
    <span className={cn("demo-swap", className)}>
      <span style={beat(0, at)}>{before}</span>
      <span style={beat(at)}>{after}</span>
    </span>
  );
}
