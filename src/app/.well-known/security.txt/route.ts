import { crawlOrigin, securityTxtFor } from "@/lib/crawl-rules";

/** /.well-known/security.txt (RFC 9116): where to report a vulnerability. */
export function GET(): Response {
  return new Response(securityTxtFor(crawlOrigin()), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
