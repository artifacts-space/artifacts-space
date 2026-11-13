import type { ReactNode } from "react";

import { ClaudeInstallButton, CodexInstallButton, CursorInstallButton, GrokBotInstallButton, type InstallButtonProps } from "@/components/setup/install-link-buttons";
import type { DesktopAppId } from "@/lib/setup/client-installs";
import { cn } from "@/lib/utils";

/**
 * "Add to" buttons for the desktop apps. Every button is a link. Cursor and
 * Claude publish an install link: Cursor's opens the app, and Claude's opens
 * claude.ai, each with the server filled in for the person to confirm. Codex
 * and Grok Bot publish none, so their buttons open the app's steps on the
 * clients page of the docs, in a new tab.
 */

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
