import Link from "next/link";

import { ArtifactIcon } from "./artifact-icon";

interface ArtifactTitleLinkProps {
  publicId: string;
  title: string;
  icon: string | null;
}

/** An artifact's title as a one-line link to its page, with its icon in front when it has one. */
export function ArtifactTitleLink({ publicId, title, icon }: ArtifactTitleLinkProps) {
  return (
    <Link href={`/artifact/${publicId}`} className="flex min-w-0 items-center gap-1.5 text-md font-medium hover:underline">
      {icon ? <ArtifactIcon icon={icon} /> : null}
      <span className="truncate">{title}</span>
    </Link>
  );
}
