"use client";

import { IconMessage } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInlineComments } from "@/components/inline-comments/inline-comments-context";

import { CommentThread } from "./comment-thread";
import { useLinkedComments } from "./linked-comments";
import { usePendingQuote } from "./quote-request";

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
 * after the artifact itself has opened.
 */
export function CommentsDialog({ publicId, title, seesComments, offNotice, className }: CommentsDialogProps) {
  const { linked, consume } = useLinkedComments(publicId);
  const [open, setOpen] = useState(linked);
  // A later link to this artifact, while it is already open, opens the dialog again.
  const [wasLinked, setWasLinked] = useState(linked);
  if (linked !== wasLinked) {
    setWasLinked(linked);
    if (linked) setOpen(true);
  }
  // "Comment" in a block's menu opens the dialog; the thread inside takes the quote (quote-request.ts).
  const quote = usePendingQuote(publicId);
  const [quoteSeen, setQuoteSeen] = useState(quote);
  if (quote !== quoteSeen) {
    setQuoteSeen(quote);
    if (quote !== null && seesComments) setOpen(true);
  }
  // "Show in the text" on an inline comment opens its thread at its words; the dialog gets out of the way.
  const atText = useAtText(publicId);
  const [wasAtText, setWasAtText] = useState(atText);
  if (atText !== wasAtText) {
    setWasAtText(atText);
    if (atText) setOpen(false);
  }
  useEffect(() => {
    if (linked) consume();
  }, [linked, consume]);
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
