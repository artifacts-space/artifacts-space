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

/**
 * Comment rate limits per author, by name in src/lib/abuse/limits.ts (the
 * shared Postgres rate limiter): agents 6 a minute and 60 an hour, people
 * 20 a minute and 300 an hour.
 */
export const COMMENT_RATE_LIMITS = {
  agent: ["agentCommentMinute", "agentCommentHour"],
  person: ["personCommentMinute", "personCommentHour"],
} as const;

/** Rate limits on resolving or reopening a thread, per person, by name in src/lib/abuse/limits.ts: 30 a minute and 300 an hour. */
export const RESOLVE_RATE_LIMITS = ["commentResolveMinute", "commentResolveHour"] as const;

/** How many earlier comments inbox_list returns with each mention, for context. */
export const INBOX_CONTEXT_COMMENTS = 5;

/**
 * A mention in a document's own text (document-mentions.ts). A save looks up
 * at most MAX_DOCUMENT_HANDLES of the handles that have nobody told yet, and
 * notifies at most MAX_MENTIONS_PER_SAVE people or agents: the rest are
 * notified by a later save, never dropped. A handle stays in that window
 * while nobody has been told through it: one that reaches nobody (unknown,
 * the writer's own, outside the writer's teams) and one whose owner is not
 * served the text yet (a private draft, an edit waiting for approval). A
 * handle past the window waits behind MAX_DOCUMENT_HANDLES of those.
 */
export const MAX_DOCUMENT_HANDLES = 50;
export const MAX_MENTIONS_PER_SAVE = 5;

/** The most of a document's text inbox_list returns around a mention, in characters. */
export const MENTION_BLOCK_MAX = 2_000;
