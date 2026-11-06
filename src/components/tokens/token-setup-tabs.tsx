"use client";

import { useId } from "react";

import { CodeBlock, CommandBlock } from "@/components/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SETUP_COMMAND, SETUP_COMMAND_STATUS } from "@/lib/setup/install-command";
import { claudeMcpAddCommand, mcpConfigJson } from "@/lib/setup/mcp-config";

/** What to do with a new token: run the setup command, or paste a ready MCP config. */
export function TokenSetupTabs({ token, origin }: { token: string; origin: string }) {
  const headingId = useId();
  const comingSoon = SETUP_COMMAND_STATUS === "coming-soon";
  return (
    <section aria-labelledby={headingId} className="grid min-w-0 gap-2">
      <h3 id={headingId} className="text-sm font-medium">Continue setting up</h3>
      <Tabs defaultValue="agent" className="min-w-0 gap-3">
        <TabsList variant="line" className="h-9 w-full justify-start gap-4 rounded-none border-b p-0">
          <TabsTrigger value="agent" className="flex-none px-0">Coding agent</TabsTrigger>
          <TabsTrigger value="mcp" className="flex-none px-0">MCP</TabsTrigger>
        </TabsList>
        <TabsContent value="agent" className="grid min-w-0 gap-2.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-muted-foreground">
            Run this command, then paste the token when asked.
            {comingSoon ? <span className="rounded-sm border px-1.5 text-[11px] leading-4.5">Coming soon</span> : null}
          </p>
          <CommandBlock command={SETUP_COMMAND} />
          {comingSoon ? (
            <p className="text-xs leading-5 text-muted-foreground">The setup command is not published yet. Use the MCP tab to connect now.</p>
          ) : null}
        </TabsContent>
        <TabsContent value="mcp" className="grid min-w-0 gap-2.5">
          <p className="text-[13px] leading-5 text-muted-foreground">Add this server to your MCP client. Your token is already in it.</p>
          <CodeBlock title="mcp.json" value={mcpConfigJson(origin, token)} preClassName="p-3 text-xs leading-5" />
          <p className="text-[13px] leading-5 text-muted-foreground">Or add it to Claude Code with one command.</p>
          <CommandBlock command={claudeMcpAddCommand(origin, token)} />
          <p className="text-xs leading-5 text-muted-foreground">Both contain your token. Keep them out of source control.</p>
        </TabsContent>
      </Tabs>
    </section>
  );
}
