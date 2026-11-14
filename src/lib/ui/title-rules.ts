/**
 * True when a title (a Heading block's text, a Section's or Card's title)
 * has words to show. A title of only spaces or line breaks shows nothing,
 * so it is no heading: the read view leaves the heading out and the editor
 * takes it out of the outline, and the two must agree.
 */
export function hasTitleText(text: string | undefined): text is string {
  return text !== undefined && text.trim() !== "";
}
