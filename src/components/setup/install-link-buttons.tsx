import { IconArrowUpRight } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { ClientLogo } from "@/components/setup/client-logos";
import { Button } from "@/components/ui/button";
import { claudeInstallLink, cursorInstallLink, type DesktopAppId } from "@/lib/setup/client-installs";
import { cn } from "@/lib/utils";

/** The look every "Add to" button shares, link or not: an outline button that starts with the app's mark. */
export const installButtonClass = "h-9 gap-2 px-3";

/** Props the install buttons take. */
export interface InstallButtonProps {
  /** The site origin, such as "https://artifacts.space". */
  origin: string;
  className?: string | undefined;
}

/** An "Add to" button that is a plain link: the app's mark, the label, and an arrow that says it leaves the page. */
function InstallLink({ app, href, newTab = false, className, children }: { app: DesktopAppId; href: string; newTab?: boolean; className?: string | undefined; children: ReactNode }) {
  const link = newTab ? <a href={href} target="_blank" rel="noopener noreferrer" /> : <a href={href} />;
  return (
    <Button render={link} nativeButton={false} variant="outline" data-install={app} className={cn(installButtonClass, className)}>
      <ClientLogo id={app} />
      {children}
      {newTab ? <span className="sr-only"> (opens in a new tab)</span> : null}
      <IconArrowUpRight aria-hidden data-icon="inline-end" />
    </Button>
  );
}

/**
 * "Add to Cursor": opens Cursor's install prompt with the server URL filled
 * in. A plain link to Cursor's documented `cursor://` deeplink; nothing runs
 * until the person confirms in Cursor.
 */
export function CursorInstallButton({ origin, className }: InstallButtonProps) {
  return <InstallLink app="cursor" href={cursorInstallLink(origin)} className={className}>Add to Cursor</InstallLink>;
}

/**
 * "Add to Claude": opens claude.ai's "Add custom connector" form in a new
 * tab with the name and server URL filled in. A plain link to Claude's
 * documented install link; nothing is added until the person confirms in
 * Claude. It opens the website, never the desktop app, so the label does
 * not say Desktop; the connector is saved to the Claude account, and Claude
 * Desktop shows it too.
 */
export function ClaudeInstallButton({ origin, className }: InstallButtonProps) {
  return <InstallLink app="claude-desktop" href={claudeInstallLink(origin)} newTab className={className}>Add to Claude</InstallLink>;
}
