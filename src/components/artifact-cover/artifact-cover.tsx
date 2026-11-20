import { CoverArt } from "./cover-art";
import { CoverFrame } from "./cover-frame";
import { EditableCover } from "./editable-cover";

interface ArtifactCoverProps {
  publicId: string;
  /** The cover of the version this viewer reads. */
  cover: string | null;
  /** Editors get Change, Reposition, and Remove. */
  editable: boolean;
  /** The artifact's "Full width" setting, so the editors' controls line up with the page column. */
  fullWidth: boolean;
  /** The page has an icon, drawn across the cover's lower edge: what an editor's removed cover leaves room for. */
  hasIcon: boolean;
}

/**
 * The cover banner at the top of an artifact's page, full-bleed under
 * the sticky chrome. Readers see only the picture; editors also get its
 * controls. Render it inside a ThemeScope so gradients take the theme.
 */
export function ArtifactCover({ publicId, cover, editable, fullWidth, hasIcon }: ArtifactCoverProps) {
  if (!cover) return null;
  if (editable) return <EditableCover key={cover} publicId={publicId} cover={cover} fullWidth={fullWidth} hasIcon={hasIcon} />;
  return (
    <CoverFrame>
      <CoverArt cover={cover} />
    </CoverFrame>
  );
}
