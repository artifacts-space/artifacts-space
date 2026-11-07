"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { DocsLink, DocsNavTree } from "@/lib/docs/navigation";
import { cn } from "@/lib/utils";

interface NavItemProps {
  link: DocsLink;
  active: boolean;
  nested?: boolean;
  onNavigate?: (() => void) | undefined;
  children?: ReactNode;
}

function NavItem({ link, active, nested = false, onNavigate, children }: NavItemProps) {
  return (
    <li>
      <Link
        href={link.href}
        aria-current={active ? "page" : undefined}
        onClick={() => { onNavigate?.(); }}
        className={cn(
          "block rounded-md px-2 py-1.5 text-sm transition-colors",
          nested && "py-1",
          active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {link.title}
      </Link>
      {children}
    </li>
  );
}

function ComponentGroups({ tree, pathname, onNavigate }: { tree: DocsNavTree; pathname: string; onNavigate?: (() => void) | undefined }) {
  return (
    <div className="mt-1 mb-2 ml-2 space-y-3 border-l pl-2">
      {tree.componentGroups.map((group) => (
        <div key={group.name}>
          <p className="px-2 pt-1 pb-1 text-xs text-muted-foreground">{group.name}</p>
          <ul>
            {group.links.map((link) => <NavItem key={link.href} link={link} active={pathname === link.href} nested onNavigate={onNavigate} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The docs navigation: sections and their pages. Under JSON Render, the
 * component list opens while you read a component page or the index.
 * `onNavigate` lets the phone sheet close itself after a tap.
 */
export function DocsSidebar({ tree, onNavigate, className }: { tree: DocsNavTree; onNavigate?: () => void; className?: string }) {
  const pathname = usePathname();
  const inComponents = pathname.startsWith(tree.componentsHref);
  return (
    <nav aria-label="Docs" className={cn("space-y-6 text-sm", className)}>
      {tree.sections.map((section) => (
        <div key={section.name}>
          <p className="px-2 pb-1.5 text-xs font-medium text-foreground">{section.name}</p>
          <ul>
            {section.links.map((link) => (
              <NavItem key={link.href} link={link} active={pathname === link.href} onNavigate={onNavigate}>
                {link.href === tree.componentsHref && inComponents ? <ComponentGroups tree={tree} pathname={pathname} onNavigate={onNavigate} /> : null}
              </NavItem>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
