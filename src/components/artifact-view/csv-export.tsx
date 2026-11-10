"use client";

import { createContext, type ClipboardEvent, useContext } from "react";
import { toast } from "sonner";

import { csvCopyOffNote } from "@/lib/csv-export/rules";

/**
 * Whether this reader may take the sheet's data out (mayExportCsv), decided
 * on the server. While false, the grid and its formula bar copy nothing.
 * Without a provider, copying works, as it does for every other format: the
 * artifact page supplies the decision for readers (SheetFormatFor); the app
 * and the shared panel show sheets only to people who may edit them.
 * The guard is scoped to the sheet: it catches a copy whose selection starts
 * in the grid or the formula bar, not one dragged in from the page around
 * it. A deterrent, like the rest; the server routes are the real gate.
 */
export const CsvExportContext = createContext(true);

/** Whether copying out of the sheet is allowed for this reader. */
export function useCsvExportAllowed(): boolean {
  return useContext(CsvExportContext);
}

/**
 * Stops a copy from the grid or its formula bar and says why. A deterrent,
 * not DRM: it covers Cmd or Ctrl+C and the context menu's Copy, not what the
 * operating system can do with what is on screen.
 */
export function refuseCopy(event: ClipboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.clipboardData.setData("text/plain", "");
  toast.info(csvCopyOffNote);
}
