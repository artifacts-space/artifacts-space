const roundedClass = /(?:^|\s)rounded-(?:md|lg|xl|2xl)(?:\s|$)/;
const borderClass = /(?:^|\s)border(?:\s|$)/;
const cardBackground = /(?:^|\s)bg-card(?:\s|$)/;
const shadowClass = /(?:^|\s)shadow-(?:xs|sm|md|lg|none)(?:\s|$)/;
const quotedClasses = /"([^"\n]*)"/g;

/**
 * True when a class list hand-writes a card (rounded, bordered, card colored)
 * without a shadow decision. Such surfaces should use the `card-surface`
 * utility, or `card-nested` inside another card. A class list that names a
 * shadow step on purpose (a well or frame at shadow-xs) passes.
 */
export function isHandRolledCard(classes: string): boolean {
  if (!roundedClass.test(classes) || !borderClass.test(classes) || !cardBackground.test(classes)) return false;
  return !shadowClass.test(classes);
}

/** Every quoted class list in a source file that hand-writes a card. */
export function findHandRolledCards(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(quotedClasses)) {
    const classes = match[1] ?? "";
    if (isHandRolledCard(classes)) found.push(classes);
  }
  return found;
}
