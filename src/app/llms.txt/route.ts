import { crawlOrigin } from "@/lib/crawl-rules";
import { llmsTxtFor } from "@/lib/llms-txt";

/** /llms.txt: what this site is and where its docs are, as Markdown for language models. */
export function GET(): Response {
  return new Response(llmsTxtFor(crawlOrigin()), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
