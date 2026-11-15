/** Text helpers for fixtures at a component's limits. Kept apart so every fixture file can use them without importing the others. */

const sentence = "Agents save decisions, plans, and results here so the next session starts with context. ";

/** Text at a component's length limit, made of real words. */
export const longText = (length: number) => sentence.repeat(Math.ceil(length / sentence.length)).slice(0, length).trim();

/** One unbroken token, to test wrapping. */
export const unbroken = (length: number) => "x".repeat(length);
