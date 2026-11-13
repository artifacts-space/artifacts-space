import type { ReactNode } from "react";

import { Prose } from "@/components/docs/docs-content";

/**
 * The pieces every client guide is built from: the props they take, the
 * small label over each part, the sign-in steps they end with, and the
 * check that the connection works. Kept apart from the guides so a page
 * that shows one or two guides does not load all of them.
 */

/** Props every guide takes. */
export interface ClientGuideProps {
  /** The site origin, such as "https://artifacts.space". */
  origin: string;
  /** Show alternatives and fine print, for the clients page. */
  full?: boolean;
}

/** The small heading over one part of a guide, such as "In the terminal". */
export function Label({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-sm font-medium text-muted-foreground first:mt-0">{children}</p>;
}

/** The sign-in and approval every OAuth client ends with. */
export function ApproveSteps({ opener }: { opener: ReactNode }) {
  return (
    <>
      <Label>What happens next</Label>
      <Prose className="mt-2">
        <ol>
          <li>{opener}</li>
          <li>Sign in to artifacts.space, then approve the connection. Turn on <strong>Read-only access</strong> if the agent should only read.</li>
          <li>The agent sees the artifacts tools. It stays signed in, and you can revoke it on the <strong>Connections</strong> page.</li>
        </ol>
      </Prose>
    </>
  );
}

/** The opening line for a client with no install link. */
export function NoOneClick({ client }: { client: string }) {
  return <p className="text-md leading-6 text-muted-foreground">There&apos;s no one-click link for {client} yet. It takes about a minute by hand.</p>;
}

/**
 * The step that checks the connection: the command or snippet that shows
 * it, when there is one, then what to look for. With no children it is
 * text only, with no empty box.
 */
export function CheckStep({ children, note }: { children?: ReactNode; note: ReactNode }) {
  return (
    <>
      <Label>Check the connection</Label>
      {children === undefined ? null : <div className="mt-2">{children}</div>}
      <Prose className="mt-2"><p>{note}</p></Prose>
    </>
  );
}
