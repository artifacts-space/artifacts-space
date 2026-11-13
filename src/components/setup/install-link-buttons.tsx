import { IconArrowUpRight } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { ClientLogo } from "@/components/setup/client-logos";
import { Button } from "@/components/ui/button";
import { docsHref } from "@/lib/docs/pages";
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
 * "Add to Claude Desktop": opens claude.ai's "Add custom connector" form in
 * a new tab with the name and server URL filled in. A plain link to Claude's
 * documented install link; nothing is added until the person confirms in
 * Claude. Claude publishes no link that opens the desktop app, so the form
 * opens on the website; the connector is saved to the Claude account, and
 * Claude Desktop shows it. The line under the buttons says so.
 */
export function ClaudeInstallButton({ origin, className }: InstallButtonProps) {
  return <InstallLink app="claude-desktop" href={claudeInstallLink(origin)} newTab className={className}>Add to Claude Desktop</InstallLink>;
}

/**
 * "Add to Codex": Codex publishes no install link, so the button opens the
 * Codex steps on the clients page of the docs, in a new tab.
 */
export function CodexInstallButton({ className }: InstallButtonProps) {
  return <InstallLink app="codex" href={docsHref("clients", "codex")} newTab className={className}>Add to Codex</InstallLink>;
}

/**
 * "Add to Grok Bot": Grok Bot publishes no install link, so the button opens
 * the Grok Bot steps on the clients page of the docs, in a new tab.
 */
export function GrokBotInstallButton({ className }: InstallButtonProps) {
  return <InstallLink app="grok-bot" href={docsHref("clients", "grok-bot")} newTab className={className}>Add to Grok Bot</InstallLink>;
}
