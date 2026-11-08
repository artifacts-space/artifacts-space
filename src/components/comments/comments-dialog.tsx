"use client";

import { IconMessage } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { CommentThread } from "./comment-thread";

interface CommentsDialogProps {
  publicId: string;
  title: string;
  /** The viewer may read and write comments here. Otherwise the dialog says why there are none. */
  seesComments: boolean;
  /** What to say when comments are off, for example where to turn them on. */
  offNotice: string;
  className?: string;
}

/**
 * The Comments button and dialog in the /app workspace, beside History: the
 * artifact's thread and composer in one scrolling dialog, so the content pane
 * holds only the artifact. The thread loads when the dialog opens.
 */
export function CommentsDialog({ publicId, title, seesComments, offNotice, className }: CommentsDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className={className} onClick={() => { setOpen(true); }}>
        {/* Icon only on phones, where the toolbar is tight; the label stays the button's name. */}
        <IconMessage /> <span className="max-sm:sr-only">Comments</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(88dvh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-4 py-3 pr-12 sm:px-5">
            <DialogTitle className="truncate">Comments on {title}</DialogTitle>
            <DialogDescription>@mention a teammate or an agent to bring them in.</DialogDescription>
          </DialogHeader>
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
            {seesComments ? <CommentThread publicId={publicId} /> : <p className="text-sm text-muted-foreground">{offNotice}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
