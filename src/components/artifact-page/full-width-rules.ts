/**
 * Whether the header's Full width checkbox is ticked. The artifact page
 * passes the width its server-rendered column has, which every save and
 * width change refreshes, so the checkbox always matches the page around it,
 * even when the editor's copy was read before a width change landed. With no
 * page width (the dev fixture), it shows the width the control last saved or
 * followed from the editor's copy.
 */
export function shownFullWidth({ page, followed }: { page: boolean | undefined; followed: boolean }): boolean {
  return page ?? followed;
}
