import { pageHostRefusal } from "@/lib/page-host/respond";

/**
 * Where every request to a host under the page domain that is not a page
 * host ends (pageDomainRewrites in src/lib/page-host/rules.ts): nothing is
 * there. It reads nothing, so it is the same answer for everyone, whatever
 * the method. The site-wide security headers of the Next config also apply
 * on these hosts and win over the answer's own; both forbid framing, and
 * the body is plain text that may not be sniffed.
 */
function refuse(): Response {
  return pageHostRefusal();
}

export { refuse as DELETE, refuse as GET, refuse as HEAD, refuse as OPTIONS, refuse as PATCH, refuse as POST, refuse as PUT };
