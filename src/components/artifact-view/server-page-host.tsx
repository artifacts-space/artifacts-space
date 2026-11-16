import type { ReactNode } from "react";

import { pageHostBase } from "@/lib/page-host/rules";

import { PageHostProvider } from "./page-frame";

/**
 * Lets the HTML artifacts inside it run: gives their frames this
 * deployment's page host (`PAGE_HOST`, read on the server at request time).
 * Where none is set up, they show their source instead.
 */
export function ServerPageHost({ children }: { children: ReactNode }) {
  return <PageHostProvider base={pageHostBase()}>{children}</PageHostProvider>;
}
