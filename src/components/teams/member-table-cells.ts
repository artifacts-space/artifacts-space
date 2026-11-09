/**
 * Cell classes for the team page's tables, shared by server and client
 * components (a value exported from a client module is only a reference on
 * the server). Every row uses the same paddings, so
 * people, agents, and invitations line up under the header: 20px at the
 * table's edges, 12px between columns.
 */
export const cell = {
  first: "py-2.5 pr-3 pl-5 align-middle",
  middle: "px-3 py-2.5 align-middle",
  last: "py-2.5 pr-5 pl-3 text-right align-middle",
  /** Columns that fold into the name cell's second line on phones. */
  wide: "hidden px-3 py-2.5 align-middle sm:table-cell",
};

export const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
