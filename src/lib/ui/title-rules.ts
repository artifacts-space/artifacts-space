/**
 * True when a title (a Heading block's text, a Section's or Card's title
 * or description, a Separator's label) has words to show. A title of only spaces or line breaks shows nothing,
 * so it is no heading: the read view leaves the heading out and the editor
 * takes it out of the outline, and the two must agree.
 */
export function hasTitleText(text: string | undefined): text is string {
  return text !== undefined && text.trim() !== "";
}

/**
 * The words on a control that must have a name (an accordion item's
 * button, a tab): its own title, or `fallback` when the title has no words.
 * The fallback is shown, not only announced: a blank strip to click helps
 * nobody, sighted or not, and the visible words keep the name and the
 * label the same.
 */
export function titleOr(text: string | undefined, fallback: string): string {
  return hasTitleText(text) ? text : fallback;
}
