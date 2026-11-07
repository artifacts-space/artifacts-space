"use client";

import { IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";

import { clientGuides } from "@/components/setup/client-guides";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { docsHref } from "@/lib/docs/pages";
import { mcpClients } from "@/lib/setup/client-installs";

/**
 * Pick your agent, then follow its steps: a one-click button where the
 * client has one, the exact config or steps, and what happens after.
 * Each tab links to the full guide on the clients page.
 */
export function ClientPicker({ origin }: { origin: string }) {
  return (
    <Tabs defaultValue="claude-code" className="card-surface mt-6 min-w-0 gap-0 overflow-hidden">
      <div className="overflow-x-auto border-b">
        <TabsList variant="line" aria-label="Choose your agent" className="h-11 w-max min-w-full justify-start gap-5 px-4">
          {mcpClients.map((client) => (
            <TabsTrigger
              key={client.id}
              value={client.id}
              className="flex-none px-0 group-data-horizontal/tabs:after:bottom-0"
            >
              {client.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {mcpClients.map((client) => {
        const Guide = clientGuides[client.id];
        return (
          <TabsContent key={client.id} value={client.id} className="min-w-0 p-4 sm:p-5">
            <Guide origin={origin} />
            <Link
              href={docsHref("clients", client.id)}
              className="mt-6 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              More options and details
              <IconArrowRight aria-hidden className="size-3.5" />
            </Link>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
