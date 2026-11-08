import { CoverArt } from "./cover-art";
import { CoverFrame } from "./cover-frame";
import { EditableCover } from "./editable-cover";

interface ArtifactCoverProps {
  publicId: string;
  /** The cover of the version this viewer reads. */
  cover: string | null;
  /** Editors get Change, Reposition, and Remove. */
  editable: boolean;
}

/**
 * The slim cover banner at the top of an artifact's page, full-bleed under
 * the sticky chrome. Readers see only the picture; editors also get its
 * controls. Render it inside a ThemeScope so gradients take the theme.
 */
export function ArtifactCover({ publicId, cover, editable }: ArtifactCoverProps) {
  if (!cover) return null;
  if (editable) return <EditableCover key={cover} publicId={publicId} cover={cover} />;
  return (
    <CoverFrame>
      <CoverArt cover={cover} />
    </CoverFrame>
  );
}
