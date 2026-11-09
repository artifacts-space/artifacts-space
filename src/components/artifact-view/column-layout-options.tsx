"use client";

import { IconArrowAutofitWidth, IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export interface ColumnLayoutProps {
  /** Moves the column one place; null when it cannot move that way. */
  onMoveLeft: (() => void) | null;
  onMoveRight: (() => void) | null;
  onFit: () => void;
}

function Option({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: (() => void) | null }) {
  return (
    <Button type="button" variant="ghost" size="sm" disabled={onClick === null} onClick={onClick ?? undefined} className="w-full justify-start font-normal">
      {icon}
      {label}
    </Button>
  );
}

/**
 * Move a column one place either way, or fit its width to the content: the
 * keyboard's way to do what dragging a header or its edge does.
 */
export function ColumnLayoutOptions({ onMoveLeft, onMoveRight, onFit }: ColumnLayoutProps) {
  return (
    <>
      <Option icon={<IconArrowLeft />} label="Move column left" onClick={onMoveLeft} />
      <Option icon={<IconArrowRight />} label="Move column right" onClick={onMoveRight} />
      <Option icon={<IconArrowAutofitWidth />} label="Fit width to content" onClick={onFit} />
    </>
  );
}
