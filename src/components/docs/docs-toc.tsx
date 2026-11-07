"use client";

import { useEffect, useState } from "react";

import type { DocsHeading } from "@/lib/docs/pages";
import { cn } from "@/lib/utils";

/**
 * Tracks which heading is in view. An IntersectionObserver reports headings
 * as they cross the top third of the screen; the last one that crossed wins.
 */
function useActiveHeading(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const elements = ids.map((id) => document.getElementById(id)).filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) setActive(first.target.id);
      },
      { rootMargin: "-56px 0px -66% 0px" },
    );
    for (const element of elements) observer.observe(element);
    return () => { observer.disconnect(); };
  }, [ids]);
  return active;
}

/** "On this page": the page's headings, with the one in view marked. Wide screens only. */
export function DocsToc({ headings }: { headings: readonly DocsHeading[] }) {
  const [ids] = useState(() => headings.map((heading) => heading.id));
  const active = useActiveHeading(ids);
  if (headings.length === 0) return null;
  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="pb-2 text-xs font-medium text-foreground">On this page</p>
      <ul className="space-y-1 border-l">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              aria-current={active === heading.id ? "location" : undefined}
              className={cn(
                "-ml-px block border-l py-1 leading-5 transition-colors",
                heading.level === 3 ? "pl-6" : "pl-3",
                active === heading.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {heading.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
