"use client";

import { IconMessage } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInlineComments } from "@/components/inline-comments/inline-comments-context";

import { CommentThread } from "./comment-thread";
import { usePendingQuote } from "./quote-request";
import { useLinkedArrival } from "./use-linked-arrival";

interface CommentsDialogProps {
  publicId: string;
  title: string;
  /** The viewer may read and write comments here. Otherwise the dialog says why there are none. */
  seesComments: boolean;
  /** What to say when comments are off, for example where to turn them on. */
  offNotice: string;
  className?: string;
}

/** True while a thread or a new comment is open at this artifact's text (its inline comments). */
function useAtText(publicId: string): boolean {
  const inline = useInlineComments();
  return inline?.publicId === publicId && (inline.activeId !== null || inline.draft !== null);
}

/**
 * The Comments button and dialog in the /app workspace, beside History: the
 * artifact's thread and composer in one scrolling dialog, so the content pane
 * holds only the artifact. The thread loads when the dialog opens. A link
 * such as /app?artifact=<id>&comments=1 opens it once for that artifact,
 * after the artifact itself has opened, and /app?artifact=<id>&comment=<id>
 * opens it at that comment (or the thread's card at its words; see
 * useLinkedArrival). A later link to this artifact opens it again.
 */
export function CommentsDialog({ publicId, title, seesComments, offNotice, className }: CommentsDialogProps) {
  const [open, setOpen] = useState(false);
  // The comment a link asked for, while the dialog it opened stays open.
  const [focusId, setFocusId] = useState<string | null>(null);
  useLinkedArrival(publicId, (focus) => {
    setFocusId(focus);
    setOpen(true);
  });
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setFocusId(null);
  };
  // "Comment" in a block's menu opens the dialog; the thread inside takes the quote (quote-request.ts).
  const quote = usePendingQuote(publicId);
  const [quoteSeen, setQuoteSeen] = useState(quote);
  if (quote !== quoteSeen) {
    setQuoteSeen(quote);
    if (quote !== null && seesComments) {
      setFocusId(null);
      setOpen(true);
    }
  }
  // "Show in the text" on an inline comment opens its thread at its words; the dialog gets out of the way.
  const atText = useAtText(publicId);
  const [wasAtText, setWasAtText] = useState(atText);
  if (atText !== wasAtText) {
    setWasAtText(atText);
    if (atText) changeOpen(false);
  }
  return (
    <>
      <Button variant="ghost" size="sm" className={className} onClick={() => { setFocusId(null); setOpen(true); }}>
        {/* Icon only on phones, where the toolbar is tight; the label stays the button's name. */}
        <IconMessage /> <span className="max-sm:sr-only">Comments</span>
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        {/* A linked comment takes focus itself once it is on screen, so the dialog leaves focus to it. */}
        <DialogContent initialFocus={focusId === null} className="flex h-[min(88dvh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-4 py-3 pr-12 sm:px-5">
            <DialogTitle className="truncate">Comments on {title}</DialogTitle>
            <DialogDescription>@mention a teammate or an agent to bring them in.</DialogDescription>
          </DialogHeader>
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
            {seesComments ? <CommentThread publicId={publicId} focusId={focusId} /> : <p className="text-sm text-muted-foreground">{offNotice}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
