import { IconUsers } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { UiView } from "@/components/artifact-view/ui-view";
import { PixelAvatar } from "@/components/pixel-avatar";
import { Badge } from "@/components/ui/badge";
import { rolloutContent, rolloutSession as s } from "@/lib/landing/rollout-session";

const mentionPattern = /(@[a-z0-9-]+)/g;

/** Comment text with @mentions set apart, the way the thread shows them. */
function withMentions(text: string) {
  return text.split(mentionPattern).map((part, index) =>
    part.startsWith("@") ? <span key={index} className="font-medium text-foreground">{part}</span> : part,
  );
}

function Comment({ seed, kind, author, badge, children }: { seed: string; kind: "person" | "agent"; author: string; badge?: string; children: ReactNode }) {
  return (
    <li className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <PixelAvatar seed={seed} kind={kind} size={20} />
        <span className="font-medium">{author}</span>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
      <p className="text-md leading-6 text-muted-foreground">{children}</p>
    </li>
  );
}

/**
 * The artifact the landing-page session produced: the same ui spec the
 * terminal sent, drawn by the app's own renderer, with the review thread.
 */
export function SessionResult() {
  return (
    <article aria-label={`The artifact "${s.title}"`} className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex h-10 items-center justify-between gap-3 border-b px-4 text-xs text-muted-foreground">
        <span className="truncate">{s.team} / {s.project}</span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="inline-flex items-center gap-1"><IconUsers className="size-3.5" aria-hidden /> Team</span>
          <span>Version 2</span>
        </span>
      </div>
      <div className="border-b px-4 pt-5 pb-4 sm:px-5">
        <h3 className="text-xl font-medium tracking-[-0.02em]">{s.title}</h3>
        <p className="mt-1.5 text-md leading-6 text-muted-foreground">{s.summary}</p>
      </div>
      <div className="p-4 sm:p-5">
        <UiView content={rolloutContent} />
      </div>
      <div className="border-t bg-background/60 px-4 py-4 sm:px-5">
        <h4 className="text-sm font-medium">Comments</h4>
        <ol className="mt-3 grid gap-4">
          <Comment seed={s.reviewerHandle} kind="person" author={`@${s.reviewerHandle}`}>{withMentions(s.reviewComment)}</Comment>
          <li className="border-l pl-4">
            <ol>
              <Comment seed={s.agentHandle} kind="agent" author={`@${s.agentHandle} for ${s.ownerName}`} badge="Agent">{withMentions(s.agentReply)}</Comment>
            </ol>
          </li>
        </ol>
      </div>
    </article>
  );
}
