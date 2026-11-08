"use client";

import { IconChartBar, IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/artifact-types";
import { getViewStatsAction } from "@/lib/views/actions";
import type { ViewRange, ViewStats } from "@/lib/views/view-stats-rules";

import { RangeSwitch, ViewsPanel } from "./views-panel";

/** Loads one range of stats. The server action by default; fixtures pass their own. */
export type LoadViewStats = (publicId: string, days: ViewRange) => Promise<ActionResult<ViewStats>>;

const OFFLINE = "Something went wrong. Check your connection and try again.";

interface ViewsDialogProps {
  publicId: string;
  title: string;
  load?: LoadViewStats;
  className?: string;
}

type Loaded = Partial<Record<ViewRange, ViewStats>>;

function Body({ stats, error }: { stats: ViewStats | undefined; error: string }) {
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!stats) {
    return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><IconLoader2 className="size-3.5 animate-spin" /> Loading views…</p>;
  }
  return <ViewsPanel stats={stats} />;
}

/**
 * The Views button and dialog in the /app workspace, for people who may edit
 * the artifact: how many people read it while it was public, per day, and
 * which sites sent them. Each range loads when it is first shown, from event
 * handlers, never effects.
 */
export function ViewsDialog({ publicId, title, load = getViewStatsAction, className }: ViewsDialogProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<ViewRange>(30);
  const [loaded, setLoaded] = useState<Loaded>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function show(next: ViewRange, refresh: boolean) {
    setRange(next);
    setError("");
    if (!refresh && loaded[next]) return;
    setPending(true);
    try {
      const result = await load(publicId, next);
      if (result.success) setLoaded((current) => ({ ...current, [next]: result.data }));
      else setError(result.error);
    } catch {
      setError(OFFLINE);
    } finally {
      setPending(false);
    }
  }

  function openDialog() {
    setOpen(true);
    // Fresh numbers each time the dialog opens; switching ranges reuses what loaded.
    setLoaded({});
    void show(range, true);
  }

  return (
    <>
      <Button variant="ghost" size="sm" className={className} onClick={openDialog}>
        {/* Icon only on phones, where the toolbar is tight; the label stays the button's name. */}
        <IconChartBar /> <span className="max-sm:sr-only">Views</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(88dvh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-4 py-3 pr-12 sm:px-5">
            <DialogTitle className="truncate">Views of {title}</DialogTitle>
            <DialogDescription>Counted without cookies. Only people who can edit this artifact see these numbers.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
            <RangeSwitch value={range} onChange={(next) => void show(next, false)} disabled={pending} />
            <Body stats={loaded[range]} error={error} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
