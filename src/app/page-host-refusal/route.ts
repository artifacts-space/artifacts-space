import { pageHostRefusalHeaders } from "@/lib/page-host/rules";

/**
 * Where every request to a host under the page domain that is not a page
 * host ends (pageDomainRewrites in src/lib/page-host/rules.ts): nothing is
 * there. It reads nothing, so it is the same answer for everyone, whatever
 * the method.
 */
function refuse(): Response {
  return new Response("Not found", { status: 404, headers: pageHostRefusalHeaders });
}

export { refuse as DELETE, refuse as GET, refuse as HEAD, refuse as OPTIONS, refuse as PATCH, refuse as POST, refuse as PUT };
