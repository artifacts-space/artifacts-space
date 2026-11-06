import { findPublicIdByShareId } from "@/lib/artifacts";
import { siteUrl } from "@/lib/site-origin";

const shareIdPattern = /^[a-f0-9]{32}$/;

/** Legacy /share/<shareId> links move permanently to /artifact/<publicId>. Access is checked there. */
export async function GET(_request: Request, { params }: RouteContext<"/share/[id]">) {
  const { id } = await params;
  const publicId = shareIdPattern.test(id) ? await findPublicIdByShareId(id) : null;
  if (!publicId) return new Response("Not found", { status: 404 });
  return Response.redirect(siteUrl(`/artifact/${publicId}`), 308);
}
