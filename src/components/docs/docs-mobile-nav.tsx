"use client";

import { Dialog } from "@base-ui/react/dialog";
import { IconMenu2, IconX } from "@tabler/icons-react";
import { useState } from "react";

import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import type { DocsNavTree } from "@/lib/docs/navigation";

import { DocsSidebar } from "./docs-sidebar";

/**
 * The docs navigation on phones and tablets: a menu button that opens the
 * sidebar as a sheet from the left. Choosing a page closes it.
 */
export function DocsMobileNav({ tree }: { tree: DocsNavTree }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger render={<Button variant="ghost" size="icon-sm" aria-label="Open docs menu" className="lg:hidden" />}>
        <IconMenu2 />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 duration-150 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          data-docs-nav-sheet=""
          className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-3rem))] flex-col border-r bg-background shadow-lg outline-none duration-200 data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
            <Dialog.Title className="text-sm font-medium">Docs</Dialog.Title>
            <Dialog.Close render={<Button variant="ghost" size="icon-sm" aria-label="Close docs menu" />}>
              <IconX />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-5">
            <DocsSidebar tree={tree} onNavigate={() => { setOpen(false); }} />
          </div>
          <div className="flex shrink-0 items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Theme</span>
            <ThemeSwitcher />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
