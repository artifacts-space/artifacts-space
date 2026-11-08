import Link from "next/link";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { formatKinds } from "@/lib/artifact-formats";
import { formatBytes } from "@/lib/files/config";
import { storageQuota } from "@/lib/quota/rules";
import { teamLimits } from "@/lib/teams/limits";

/** "1.0 GB" reads better as "1 GB" in marketing copy. */
const quotaSize = (bytes: number) => formatBytes(bytes).replace(".0 ", " ");

interface Plan {
  id: string;
  name: string;
  lead: string;
  items: readonly string[];
  cta: { href: string; label: string; variant: "default" | "outline" };
}

const plans: readonly Plan[] = [
  {
    id: "individuals",
    name: "Individuals",
    lead: "Free forever for everyone who signs up now.",
    items: [
      `Save in all ${String(formatKinds.length)} formats: Markdown, code, text, JSON, CSV, diagrams, interfaces, and files.`,
      "Connect any agent: Claude, Codex, Cursor, OpenCode, Kimi, Devin, or any MCP client.",
      "Comment on every artifact.",
      "Restore any saved version from the history.",
      "Sort your work with projects and tags.",
      "Give each artifact its own theme and cover.",
      `Keep ${quotaSize(storageQuota.contentBytes)} of artifact content and ${quotaSize(storageQuota.fileBytes)} of files on each account.`,
    ],
    cta: { href: "/sign-up", label: "Get started", variant: "default" },
  },
  {
    id: "teams",
    name: "Teams",
    lead: "Your people and your agents work from the same artifacts.",
    items: [
      "Invite people by email. Each person is an owner, an admin, or a member.",
      "Add agent teammates. They read what the team shares, comment, and answer @mentions.",
      "Agents ask to share. Owners and admins approve.",
      "Approve edits before readers outside the team see them.",
      "Share projects, tags, and comments with the whole team.",
      "Give the team's artifacts one look with team themes and a team default.",
      `Add up to ${String(teamLimits.maxMembers)} members to each team, agents included. Shared artifacts use their author's storage.`,
    ],
    cta: { href: "/sign-up?next=%2Fteams%2Fnew", label: "Start a team", variant: "outline" },
  },
];

/** One plan card: name and price, its lead line, what it includes, then its button pinned to the bottom. */
function PlanCard({ plan }: { plan: Plan }) {
  const headingId = `plan-${plan.id}`;
  return (
    <article aria-labelledby={headingId} className="card-surface flex min-w-0 flex-col p-6 sm:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h3 id={headingId} className="text-lg font-medium">{plan.name}</h3>
        <p className="text-3xl font-medium tracking-[-0.025em]">$0</p>
      </div>
      <p className="mt-4 text-base leading-7">{plan.lead}</p>
      <ul className="mt-6 grid gap-3 border-t pt-6">
        {plan.items.map((item) => (
          <li key={item} className="flex gap-3 text-md leading-6">
            <IconCheck aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-8">
        <Button render={<Link href={plan.cta.href} />} nativeButton={false} variant={plan.cta.variant} className="h-10 px-4 text-sm">
          {plan.cta.label} <IconArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </article>
  );
}

/** Two free plans, Individuals and Teams, side by side across the full width, with the stays-free promise below. */
export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="pricing-heading">
      <h2 id="pricing-heading" className="text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
        Pricing
      </h2>
      <div data-slot="plans" className="mt-10 grid gap-6 md:grid-cols-2">
        {plans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
      </div>
      <p className="mt-6 text-md leading-6 text-muted-foreground">
        Free today for individuals and teams. Accounts and teams made now stay free, even if we add paid plans later.
      </p>
    </section>
  );
}
