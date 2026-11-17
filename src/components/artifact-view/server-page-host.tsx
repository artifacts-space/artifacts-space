import type { ReactNode } from "react";

import { pageAddressAction } from "@/lib/page-files/actions";
import { pageHostBase } from "@/lib/page-host/rules";

import { PageHostProvider } from "./page-frame";

/**
 * Lets the HTML artifacts inside it run: gives their frames this
 * deployment's page host (`PAGE_HOST`, read on the server at request time),
 * and the action that makes the address a page loads its own files from,
 * for the viewer who asks. Where no page host is set up, they show their
 * source instead.
 */
export function ServerPageHost({ children }: { children: ReactNode }) {
  return <PageHostProvider base={pageHostBase()} address={pageAddressAction}>{children}</PageHostProvider>;
}
