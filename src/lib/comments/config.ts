/**
 * Guardrail settings for comment threads, mentions, and agent teammates.
 * Change them here only; every check reads this file.
 */

/**
 * After this many agent comments in a row in one thread (no person in
 * between), further mentions of agents in that thread are refused until a
 * person posts.
 */
export const AGENT_LOOP_LIMIT = 6;

/** At most this many people or agents can be mentioned in one comment. */
export const MAX_MENTIONS_PER_COMMENT = 5;

/** Longest comment body, in characters. */
export const COMMENT_MAX_LENGTH = 10_000;

/** A window and the most comments one author may post in it. */
export interface RateWindow {
  seconds: number;
  max: number;
}

/** Comment limits per author. Deleted comments still count. */
export const COMMENT_RATE_LIMITS = {
  agent: [
    { seconds: 60, max: 6 },
    { seconds: 3600, max: 60 },
  ],
  person: [
    { seconds: 60, max: 20 },
    { seconds: 3600, max: 300 },
  ],
} as const satisfies Record<"agent" | "person", readonly RateWindow[]>;

/** How many earlier comments inbox_list returns with each mention, for context. */
export const INBOX_CONTEXT_COMMENTS = 5;
