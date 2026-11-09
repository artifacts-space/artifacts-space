"use client";

import { ConnectedApps } from "@/components/app/connected-apps";
import { HarnessByline } from "@/components/harness/harness-byline";
import type { SaveConnectionHarness } from "@/components/harness/connection-harness";
import { harnesses } from "@/lib/harness/harnesses";
import type { ConnectedApp } from "@/lib/oauth/clients";

const apps: ConnectedApp[] = [
  { clientId: "fixture-claude-code", name: "Claude Code", uri: null, access: "full", approvedAt: "2026-11-01T09:00:00.000Z", lastActiveAt: "2026-11-08T09:00:00.000Z", harness: { detected: "claude-code", detectedLabel: null, override: null } },
  { clientId: "fixture-unknown", name: "Night shift", uri: null, access: "read", approvedAt: "2026-11-02T09:00:00.000Z", lastActiveAt: null, harness: { detected: "other", detectedLabel: "zed-mcp", override: null } },
];

/** Saves nothing: the gallery has no database. Every choice succeeds. */
const saveInMemory: SaveConnectionHarness = (_target, harness) => Promise.resolve({ success: true, data: harness });

/** Every harness's byline, and the Connections page's apps with their "Agent" select, for the gallery and its e2e test. */
export function HarnessSpecimen() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ul aria-label="Harness bylines" className="grid gap-2 text-sm">
        {harnesses.map((harness) => <li key={harness.id}><HarnessByline harness={harness.id} /></li>)}
      </ul>
      <div data-harness-fixture="connections">
        <ConnectedApps initialApps={apps} saveHarness={saveInMemory} />
      </div>
    </div>
  );
}
