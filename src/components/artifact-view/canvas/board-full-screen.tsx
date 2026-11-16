"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useContext, type ReactNode } from "react";

import { ThemeScope } from "../theme-scope";
import { ThemeSourceContext } from "../theme-scope-context";

interface BoardFullScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Moves focus back into the page when the dialog closes: to the button that opened it. */
  onClosed: () => void;
  /** The board to show over the whole window. It is drawn only while this is open. */
  children: ReactNode;
}

/**
 * The canvas board over the whole window: a dialog with no edge, so Escape
 * closes it, focus stays inside it, and the page behind cannot be used until
 * it closes. Menus and tooltips of the board and its frames open over it as
 * they do in the page.
 *
 * A dialog is drawn at the end of the document, outside the artifact's
 * ThemeScope, so it wraps the board in the same theme (ThemeSourceContext).
 * Comments are for the board in the page, so nothing here can be selected
 * for one.
 */
export function BoardFullScreen({ open, onOpenChange, onClosed, children }: BoardFullScreenProps) {
  const source = useContext(ThemeSourceContext);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Popup
          data-canvas-full-screen=""
          data-comment-skip=""
          // The page takes focus back itself; false tells the dialog to leave it there.
          finalFocus={() => {
            onClosed();
            return false;
          }}
          className="fixed inset-0 z-50 bg-background outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none"
        >
          <Dialog.Title className="sr-only">Canvas, full screen</Dialog.Title>
          <ThemeScope theme={source?.theme} mode={source?.mode} className="h-full bg-background text-foreground">
            {children}
          </ThemeScope>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
