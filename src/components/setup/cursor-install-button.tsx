import { IconArrowUpRight } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { cursorInstallLink } from "@/lib/setup/client-installs";
import { cn } from "@/lib/utils";

/**
 * "Add to Cursor": opens Cursor's install prompt with the server URL filled
 * in. A plain link to Cursor's documented `cursor://` deeplink; nothing runs
 * until the person confirms in Cursor.
 */
export function CursorInstallButton({ origin, className }: { origin: string; className?: string }) {
  return (
    <Button
      render={<a href={cursorInstallLink(origin)} />}
      nativeButton={false}
      variant="outline"
      className={cn("h-9 px-3", className)}
    >
      Add to Cursor
      <IconArrowUpRight aria-hidden data-icon="inline-end" />
    </Button>
  );
}
