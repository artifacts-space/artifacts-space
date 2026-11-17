import { useState } from "react";

import { carriesArtifact, droppedArtifactId } from "./artifact-drag";

/** Drop handling for one place in the sidebar (a project's row, or the artifacts in no project): highlight while an artifact card is over it, then hand over its id. */
export function useDropTarget(onDropArtifact: (artifactId: string) => void) {
  const [over, setOver] = useState(false);
  // Enter and over both accept the drag: browsers repeat dragover only while the pointer moves.
  const accept = (event: React.DragEvent) => {
    if (!carriesArtifact(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOver(true);
  };
  return {
    over,
    handlers: {
      onDragEnter: accept,
      onDragOver: accept,
      onDragLeave: (event: React.DragEvent) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setOver(false);
      },
      onDrop: (event: React.DragEvent) => {
        setOver(false);
        const id = droppedArtifactId(event);
        if (!id) return;
        event.preventDefault();
        onDropArtifact(id);
      },
    },
  };
}
