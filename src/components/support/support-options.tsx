import { IconBook, IconBrandGithub, IconMail, IconMessageReport } from "@tabler/icons-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import { securityContactEmail } from "@/lib/crawl-rules";
import { docsHref } from "@/lib/docs/pages";
import { legalContact, mailtoHref } from "@/lib/legal/contact";
import { ISSUES_URL } from "@/lib/site-copy";

const linkClass = "font-medium text-foreground underline underline-offset-4";

interface SupportOption {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  body: ReactNode;
}

/** The ways to get help, in the order most people need them. */
const options: readonly SupportOption[] = [
  {
    id: "email",
    title: "Email us",
    icon: IconMail,
    body: (
      <>
        Write to <a href={mailtoHref(legalContact.supportEmail)} className={linkClass}>{legalContact.supportEmail}</a>. Say what you tried, what you expected, and what happened instead.
      </>
    ),
  },
  {
    id: "in-app",
    title: "Tell us from the app",
    icon: IconMessageReport,
    body: (
      <>
        Signed in? Open the account menu (your avatar, top right) and choose <strong className="font-medium text-foreground">Something&apos;s not working</strong>. Your note reaches the team with the page you were on, never your artifacts.
      </>
    ),
  },
  {
    id: "docs",
    title: "Find the answer in the docs",
    icon: IconBook,
    body: (
      <>
        The <Link href="/docs" className={linkClass}>docs</Link> cover setup for each client, the tools agents use, and limits. Connection problems? Start with <Link href={`${docsHref("quickstart")}#troubleshooting`} className={linkClass}>Troubleshooting</Link>.
      </>
    ),
  },
  {
    id: "github",
    title: "Report a bug on GitHub",
    icon: IconBrandGithub,
    body: (
      <>
        artifacts.space is open source. Open an issue in the{" "}
        <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
          public issue tracker<span className="sr-only"> (opens in a new tab)</span>
        </a>
        . Anyone can read it, so leave out private details.
      </>
    ),
  },
];

/** The Support page's list of ways to get help, then where privacy and security questions go. */
export function SupportOptions() {
  return (
    <>
      <ul className="card-surface mt-8 divide-y">
        {options.map((option) => (
          <li key={option.id} className="flex gap-4 px-5 py-4 sm:px-6">
            <option.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-lg font-medium tracking-[-0.01em]">{option.title}</h2>
              <p className="mt-1 text-md leading-6 text-muted-foreground">{option.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        Questions about your data go to <a href={mailtoHref(legalContact.privacyEmail)} className={linkClass}>{legalContact.privacyEmail}</a>. To report a security problem, write to{" "}
        <a href={mailtoHref(securityContactEmail)} className={linkClass}>{securityContactEmail}</a>.
      </p>
    </>
  );
}
