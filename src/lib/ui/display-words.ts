/*
 * What the display-only pieces of a screen say: the one name of a row of
 * avatars, a shortcut's keys as words, and a rating as a score. The views
 * and the Markdown copy of an interface read the same words.
 */

/** One person in a row of avatars, as far as the words need. */
interface Named {
  name: string;
}

const listed = new Intl.ListFormat("en", { style: "long", type: "conjunction" });
const counted = new Intl.NumberFormat("en-US");
const score = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** How a row of avatars splits: the people drawn, how many more the "+N" count stands for, and everyone in all. */
export function avatarGroupShape<P extends Named>(people: readonly P[], max = 5, total?: number) {
  const shown = people.slice(0, max);
  const everyone = Math.max(total ?? 0, people.length);
  return { shown, more: everyone - shown.length, everyone };
}

/** The row's one name: "5 people: Maya Chen, Omar Haddad, and 3 more". */
export function avatarGroupName(people: readonly Named[], max?: number, total?: number): string {
  const { shown, more, everyone } = avatarGroupShape(people, max, total);
  const names = [...shown.map((person) => person.name), ...(more > 0 ? [`${counted.format(more)} more`] : [])];
  return `${counted.format(everyone)} ${everyone === 1 ? "person" : "people"}: ${listed.format(names)}`;
}

/** Words for keys written as symbols or short forms, keyed in lower case. */
const keyWords: Record<string, string> = {
  "⌘": "Command", cmd: "Command", "⌥": "Option", opt: "Option", alt: "Alt", "⇧": "Shift", "⌃": "Control", ctrl: "Control",
  "↵": "Enter", "⏎": "Enter", "⌫": "Delete", del: "Delete", "⌦": "Forward delete", "⎋": "Escape", esc: "Escape", "⇥": "Tab",
  "←": "Left arrow", "→": "Right arrow", "↑": "Up arrow", "↓": "Down arrow", "␣": "Space", pgup: "Page up", pgdn: "Page down", "+": "Plus",
};

/** A shortcut as words, the way it is said: ["⌘", "K"] is "Command K". */
export function kbdWords(keys: readonly string[]): string {
  return keys.map((key) => keyWords[key.toLowerCase()] ?? key).join(" ");
}

/** A score as it is written: 4.5, 3, 0. */
export function scoreText(value: number): string {
  return score.format(value);
}

/** A rating in words: "4.5 out of 5", after the label when there is one. */
export function ratingWords(value: number, max = 5, label?: string): string {
  const words = `${scoreText(value)} out of ${String(max)}`;
  return label ? `${label}: ${words}` : words;
}
