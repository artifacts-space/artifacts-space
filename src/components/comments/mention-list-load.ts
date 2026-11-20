import type { MentionDirectory } from "@/lib/comments/mention-autocomplete";

import type { MentionListState } from "./mention-suggestions";

/**
 * What one request for the list of people to mention brought: the list, or
 * null when it could not be loaded. `ask` numbers the request among those
 * made for the thread, so the page can tell whether the newest one answered.
 */
export interface MentionListAnswer {
  publicId: string;
  ask: number;
  directory: MentionDirectory | null;
}

/** The newest answer, and the newest list that arrived for the same artifact (kept while a later request fails). */
export interface MentionListLoaded {
  last: MentionListAnswer;
  held: MentionDirectory | null;
}

/** What the composer is given: the list to suggest from, and what is known about it for the hint. */
export interface MentionListView {
  directory: MentionDirectory;
  list: MentionListState;
  /** The newest answer when it was a failure, so the page can ask again on the next focus; null otherwise. */
  failed: MentionListAnswer | null;
}

const emptyDirectory: MentionDirectory = { candidates: [], self: null };

/** Takes an answer in: a list replaces the one in hand, and a failure keeps it (another artifact's list is never kept). */
export function takeMentionAnswer(previous: MentionListLoaded | null, answer: MentionListAnswer): MentionListLoaded {
  const kept = previous?.last.publicId === answer.publicId ? previous.held : null;
  return { last: answer, held: answer.directory ?? kept };
}

/**
 * What the composer shows for this artifact while request number `ask` is
 * the newest. The list in hand stays while a newer one is on its way or
 * after it failed, so suggestions never blink out; the hint says "loading"
 * until the newest request answers, and "unavailable" when it failed. Only a
 * list that answered the newest request is "ready", so "No one to mention
 * here yet" is said only of a list that is known.
 */
export function mentionListView(loaded: MentionListLoaded | null, publicId: string, ask: number): MentionListView {
  const mine = loaded?.last.publicId === publicId ? loaded : null;
  const directory = mine?.held ?? emptyDirectory;
  if (mine?.last.ask !== ask) return { directory, list: "loading", failed: null };
  if (mine.last.directory === null) return { directory, list: "unavailable", failed: mine.last };
  return { directory, list: "ready", failed: null };
}
