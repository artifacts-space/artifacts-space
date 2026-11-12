"use client";

import { useRef, type ReactNode } from "react";

import { CodexGuide, GrokBotGuide } from "@/components/setup/codex-grok-guides";
import { ClientLogo } from "@/components/setup/client-logos";
import type { ClientGuideProps } from "@/components/setup/guide-parts";
import { ClaudeInstallButton, CursorInstallButton, installButtonClass, type InstallButtonProps } from "@/components/setup/install-link-buttons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { DesktopAppId } from "@/lib/setup/client-installs";
import { cn } from "@/lib/utils";

/**
 * "Add to" buttons for the desktop apps. Cursor and Claude publish an
 * install link, so their buttons are links: Cursor's opens the app, and
 * Claude's opens claude.ai, each with the server filled in for the person
 * to confirm. Codex and Grok Bot publish none, so their buttons open
 * the few steps left, with the URL and the command ready to copy: the same
 * guide the docs show, so the two cannot drift. The dialog says there is no
 * install link in its own words, so the guide leaves out its opening line.
 */

/** An "Add to" button for an app with no install link: it opens that app's steps in a dialog. */
function StepsInstallButton({ app, name, Guide, origin, className }: InstallButtonProps & { app: DesktopAppId; name: string; Guide: (props: ClientGuideProps) => ReactNode }) {
  // The steps can be taller than a phone: the header and its Close button stay put and only the steps scroll.
  // Focus goes to the dialog itself, so it opens at the first step and not scrolled to a copy button further down.
  const popup = useRef<HTMLDivElement>(null);
  const label = `Add to ${name}`;
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" data-install={app} className={cn(installButtonClass, className)} />}>
        <ClientLogo id={app} />
        {label}
      </DialogTrigger>
      <DialogContent ref={popup} initialFocus={popup} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{name} has no install link yet. These steps take about a minute. You sign in and approve in your browser; there is no token to copy.</DialogDescription>
        </DialogHeader>
        <div data-slot="install-steps" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <Guide origin={origin} hideNoOneClick />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Add to Codex": the command for the terminal and the steps for the ChatGPT desktop app. */
function CodexInstallButton({ origin, className }: InstallButtonProps) {
  return <StepsInstallButton app="codex" name="Codex" Guide={CodexGuide} origin={origin} className={className} />;
}

/** "Add to Grok Bot": the steps for the desktop app and the message that asks a Bot to add the server. */
function GrokBotInstallButton({ origin, className }: InstallButtonProps) {
  return <StepsInstallButton app="grok-bot" name="Grok Bot" Guide={GrokBotGuide} origin={origin} className={className} />;
}

/** Each desktop app's "Add to" button, by id. */
const installButtons: Record<DesktopAppId, (props: InstallButtonProps) => ReactNode> = {
  cursor: CursorInstallButton,
  "claude-desktop": ClaudeInstallButton,
  codex: CodexInstallButton,
  "grok-bot": GrokBotInstallButton,
};

/** One "Add to" button per desktop app, each with the app's mark, in `apps` order. */
export function DesktopAppInstalls({ origin, apps, className }: InstallButtonProps & { apps: readonly DesktopAppId[] }) {
  return (
    <ul aria-label="Add to a desktop app" data-slot="desktop-app-installs" className={cn("flex flex-wrap gap-2", className)}>
      {apps.map((app) => {
        const InstallButton = installButtons[app];
        return <li key={app}><InstallButton origin={origin} /></li>;
      })}
    </ul>
  );
}
