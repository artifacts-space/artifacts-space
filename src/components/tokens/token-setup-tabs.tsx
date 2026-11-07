"use client";

import { useId } from "react";

import { CodeSnippet, CommandSnippet } from "@/components/code/code-snippet";
import { SkillInstall } from "@/components/setup/skill-install";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { claudeMcpAddCommand, claudeMcpAddOAuthCommand, mcpConfigJson } from "@/lib/setup/mcp-config";

/** What to do with a new token: paste a ready MCP config, then add the agent skill. */
export function TokenSetupTabs({ token, origin }: { token: string; origin: string }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid min-w-0 gap-2">
      <h3 id={headingId} className="text-md font-medium">Continue setting up</h3>
      <Tabs defaultValue="mcp" className="min-w-0 gap-3">
        <TabsList variant="line" className="h-9 w-full justify-start gap-4 rounded-none border-b p-0">
          <TabsTrigger value="mcp" className="flex-none px-0">MCP</TabsTrigger>
          <TabsTrigger value="skill" className="flex-none px-0">Agent skill</TabsTrigger>
        </TabsList>
        <TabsContent value="mcp" className="grid min-w-0 gap-2.5">
          <p className="text-sm leading-5 text-muted-foreground">
            <span className="font-medium text-foreground">For CI and headless use.</span> Add this server to your MCP client. Your token is already in it.
          </p>
          <CodeSnippet title="mcp.json" language="json" code={mcpConfigJson(origin, token)} />
          <p className="text-sm leading-5 text-muted-foreground">Or add it to Claude Code with one command.</p>
          <CommandSnippet command={claudeMcpAddCommand(origin, token)} />
          <p className="text-sm leading-5 text-muted-foreground">Both contain your token. Keep them out of source control.</p>
          <p className="text-sm leading-5 text-muted-foreground">On your own computer, skip the token: run this and approve in the browser.</p>
          <CommandSnippet command={claudeMcpAddOAuthCommand(origin)} copyLabel="Copy OAuth command" />
        </TabsContent>
        <TabsContent value="skill" className="min-w-0">
          <SkillInstall intro="Add the skill so your agent knows when to save, update, and share artifacts." />
        </TabsContent>
      </Tabs>
    </section>
  );
}
