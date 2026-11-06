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

/** How many earlier comments inbox_list returns with each mention, for context. */
export const INBOX_CONTEXT_COMMENTS = 5;
