import type { Metadata } from "next";
import { connection } from "next/server";

import { PageFrame, PageHostProvider } from "@/components/artifact-view/page-frame";
import { renderPageAddressAction } from "@/lib/page-render/actions";
import { loadRenderPage } from "@/lib/page-render/load";
import { pageHostBase } from "@/lib/page-host/rules";

// Reads the token on every request: never prerendered, never cached.
export const instant = false;

export const metadata: Metadata = {
  title: "Page",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The render page: one HTML artifact's page, running in its page frame and
 * filling the window, with nothing of the site around it. Only the hosted
 * browser that draws a page for artifacts_page_image opens it, at an
 * address that holds a render token (src/lib/page-render/token.ts). The
 * page runs exactly as on the artifact page: on its own page host, in the
 * same sandbox, under the same policy. A token that does not open, an
 * artifact its person can no longer edit, or one saved since, gets one
 * note and no frame, the same for every reason, so the browser never finds
 * the frame it waits for. Not a notFound(): with Cache Components the shell
 * has streamed by then, so it could not send a 404 anyway (src/proxy.ts).
 */
export default async function RenderPage({ params }: PageProps<"/render/page/[token]">) {
  // The token is checked against the clock, at request time.
  await connection();
  const { token } = await params;
  const page = await loadRenderPage(token);
  if (!page) return <p data-slot="render-refused" className="p-6 text-md text-muted-foreground">This page cannot be drawn.</p>;
  return (
    <PageHostProvider base={pageHostBase()} address={renderPageAddressAction.bind(null, token)}>
      <main className="h-dvh w-screen bg-[Canvas]">
        <PageFrame pageKey={page.publicId} html={page.html} title={page.title} filesKey={page.filesKey} className="size-full" />
      </main>
    </PageHostProvider>
  );
}
