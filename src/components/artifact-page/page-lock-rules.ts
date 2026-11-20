/**
 * The artifact page's saved copy is null while the page is locked to its read
 * view: before its editable copy first loads, and again after the page was put
 * away and came back (edit-surface.tsx). Only loading that copy unlocks it.
 */

/**
 * What a save's answer makes of the saved copy. A locked page stays locked: a
 * save sent as the page was put away can answer after it came back, and
 * unlocking on it would show the old draft just before the loaded copy
 * replaces it, dropping whatever was typed in between.
 */
export function savedCopyAfterSave<T>(current: T | null, answer: T): T | null {
  return current === null ? null : answer;
}
