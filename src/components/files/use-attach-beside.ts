import { attachesBeside } from "@/lib/files/loose-rules";

import { askToAttach } from "./attach-bridge";
import { usePageFileDrop } from "./use-page-file-drop";

interface AttachBesideOptions {
  artifactId: string;
  /** The format as the editor has it now. */
  kind: string;
  /** False where the page takes dropped files another way (the New artifact pane, use-blank-uploads.ts). "Attach file" stays. */
  takesDrops: boolean;
  /** The part of the page a dropped file is taken on. */
  root: () => HTMLElement | null;
}

/**
 * What an artifact's page adds for a format that keeps attachments beside
 * its content (attachesBeside): "Attach file" for its More menu, and a file
 * dropped anywhere on the page. Both go to the artifact's list of attached
 * files (attach-bridge.ts). For every other format: no menu item, and
 * drops are left alone.
 */
export function useAttachBeside({ artifactId, kind, takesDrops, root }: AttachBesideOptions) {
  const attaches = attachesBeside(kind);
  const drop = usePageFileDrop({ root, enabled: attaches && takesDrops, onFiles: (files) => { askToAttach(artifactId, files); } });
  return { dragging: drop.dragging, onAttachFile: attaches ? () => { askToAttach(artifactId); } : null };
}
