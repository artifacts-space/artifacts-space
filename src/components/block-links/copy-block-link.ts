import { toast } from "sonner";

/** Copies a link to a block and says so, or says the clipboard was blocked. */
export function copyBlockLink(link: string): void {
  navigator.clipboard
    .writeText(link)
    .then(() => { toast.success("Link to block copied"); })
    .catch(() => { toast.error("Could not access the clipboard."); });
}
