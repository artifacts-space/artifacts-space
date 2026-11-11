import { previewColumnClass } from "@/lib/page-width/rules";

interface PageColumnProps {
  /** The artifact's "Full width" setting. */
  fullWidth: boolean;
  children: React.ReactNode;
}

/**
 * The artifact's body in an /app pane, in the same column as its public
 * page: centered at 1024px with the page's padding when contained, the whole
 * pane when full width. It sets no background, so a theme on the pane shows
 * through.
 */
export function PageColumn({ fullWidth, children }: PageColumnProps) {
  return <div data-slot="page-column" className={previewColumnClass(fullWidth)}>{children}</div>;
}
