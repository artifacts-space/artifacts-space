"use client";

import { IconLink, IconSearch } from "@tabler/icons-react";
import { useState } from "react";

import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import type { ArtifactKind } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

const workspace = "Lumen Coffee Roasters";

type Example = {
  id: string;
  title: string;
  project: string;
  kind: ArtifactKind;
  updated: string;
  summary: string;
  body: React.ReactNode;
};

const tiers = [
  ["Café", "10 to 49 kg", "$28.50", "+3%"],
  ["Regional", "50 to 199 kg", "$26.00", "+2%"],
  ["National", "200 kg and above", "$23.75", "No change"],
];

const nextSteps: [boolean, string][] = [
  [true, "Update the price list in the B2B store"],
  [false, "Email the 42 wholesale accounts before 17 April"],
  [false, "Add the tier rule to the invoicing script"],
];

const stockistTypes = `/** One café or retailer that stocks Lumen coffee. */
export interface Stockist {
  id: string;
  name: string;
  tier: "cafe" | "regional" | "national";
  coordinates: [number, number];
  openNow: boolean;
}

export interface StockistResponse {
  results: Stockist[];
  nextCursor: string | null;
}`;

const churnReport = `{
  "period": "2026-03",
  "accounts": 184,
  "churned": 7,
  "churnRate": 0.038,
  "topReason": "switched to a local roaster",
  "atRisk": ["Fern & Co", "Northside Deli", "Harbor Books Café"]
}`;

const tokenPattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("[^"\n]*")(?=\s*:)|("[^"\n]*")|(\b(?:export|interface|type|const|string|number|boolean|null|true|false)\b)|(\b\d+(?:\.\d+)?\b)/g;

/** Minimal token coloring for the demo. Real artifacts render through the editor. */
function highlight(code: string) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const match of code.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(code.slice(last, index));
    const [text, comment, property, string, keyword] = match;
    const className = comment
      ? "text-syntax-comment"
      : property
        ? "text-syntax-property"
        : string
          ? "text-syntax-string"
          : keyword
            ? "text-syntax-keyword"
            : "text-syntax-number";
    nodes.push(<span key={index} className={className}>{text}</span>);
    last = index + text.length;
  }
  if (last < code.length) nodes.push(code.slice(last));
  return nodes;
}

function Code({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto font-mono text-[12.5px] leading-7">
      <code>{highlight(code)}</code>
    </pre>
  );
}

const examples: Example[] = [
  {
    id: "pricing",
    title: "Wholesale pricing update, Q2 2026",
    project: "lumen-wholesale",
    kind: "markdown",
    updated: "2 min ago",
    summary: "Raise the Café and Regional tiers on 1 May. Hold National. Notify every account two weeks ahead.",
    body: (
      <div className="demo-doc">
        <h2>Decision</h2>
        <p>
          Raise Café and Regional tier prices on 1 May 2026 and hold the National tier until the annual contracts renew in Q4. Every wholesale account gets written notice at least two weeks before the change.
        </p>
        <h2>New tiers</h2>
        <table>
          <thead>
            <tr><th>Tier</th><th>Monthly volume</th><th>Price per kg</th><th>Change</th></tr>
          </thead>
          <tbody>
            {tiers.map(([tier, volume, price, change]) => (
              <tr key={tier}><td>{tier}</td><td>{volume}</td><td>{price}</td><td>{change}</td></tr>
            ))}
          </tbody>
        </table>
        <h2>Why</h2>
        <ul>
          <li>Green coffee costs rose 11% since the last review in October.</li>
          <li>Café accounts carry the highest support cost per kilogram.</li>
          <li>National accounts are on annual contracts until Q4.</li>
        </ul>
        <h2>Next steps</h2>
        <ul className="demo-checklist">
          {nextSteps.map(([done, step]) => (
            <li key={step} data-done={done || undefined}>{step}</li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    id: "types",
    title: "Store locator response types",
    project: "lumen-web",
    kind: "code",
    updated: "41 min ago",
    summary: "Shared TypeScript types for the stockist map on lumen.coffee.",
    body: <Code code={stockistTypes} />,
  },
  {
    id: "churn",
    title: "Wholesale churn, March 2026",
    project: "lumen-wholesale",
    kind: "json",
    updated: "Yesterday",
    summary: "Monthly churn snapshot pulled from the billing export.",
    body: <Code code={churnReport} />,
  },
];

const activity = [
  ["Claude Code", "created the decision record", "09:41"],
  ["Cursor", "updated the tiers table", "09:52"],
  ["OpenCode", "read it for the invoicing task", "10:07"],
  ["Maya R.", "opened the share link", "10:30"],
];

export function ArtifactDemo() {
  const [selectedId, setSelectedId] = useState(examples[0].id);
  const selected = examples.find((example) => example.id === selectedId) ?? examples[0];
  const SelectedIcon = kindIcons[selected.kind];

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(0,0,0,0.08)]">
      <div className="flex h-11 items-center justify-between border-b px-4 text-xs text-muted-foreground">
        <span><span className="text-foreground">{workspace}</span> / Artifacts</span>
        <span>{examples.length} artifacts</span>
      </div>

      <div className="grid min-h-[520px] grid-cols-[240px_minmax(0,1fr)] max-md:grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_240px]">
        <aside className="border-r bg-background/60 max-md:border-r-0 max-md:border-b">
          <div className="p-3">
            <div className="flex h-8 items-center gap-2 rounded-sm border bg-card px-2.5 text-xs text-muted-foreground">
              <IconSearch className="size-3.5" />
              Search
            </div>
          </div>
          <div className="px-2 pb-3 max-md:grid max-md:grid-cols-3 max-md:gap-1">
            {examples.map((example) => {
              const Icon = kindIcons[example.kind];
              return (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => setSelectedId(example.id)}
                  aria-pressed={selectedId === example.id}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-sm px-2.5 py-2 text-left transition-colors",
                    selectedId === example.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", kindColors[example.kind])} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{example.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {example.project} · {example.updated}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="border-b px-6 pt-6 pb-5">
            <h3 className="text-xl font-medium tracking-[-0.02em]">{selected.title}</h3>
            <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{selected.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className={cn("inline-flex items-center gap-1.5 font-medium", kindColors[selected.kind])}>
                <SelectedIcon className="size-3.5" />
                {selected.kind}
              </span>
              <span>{selected.project}</span>
              <span className="inline-flex items-center gap-1"><IconLink className="size-3.5" /> Link enabled</span>
              <span>Updated {selected.updated}</span>
            </div>
          </div>
          <div className="p-6">{selected.body}</div>
        </div>

        <aside className="border-l bg-background/60 p-4 max-lg:hidden">
          <div className="text-xs font-medium">Activity</div>
          <ol className="mt-4 space-y-4">
            {activity.map(([who, action, time]) => (
              <li key={who} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{who}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{time}</span>
                </div>
                <p className="mt-0.5 text-muted-foreground">{action}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 border-t pt-4 text-xs">
            <div className="font-medium">Access</div>
            <p className="mt-1.5 text-muted-foreground">Workspace members and anyone with the link.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
