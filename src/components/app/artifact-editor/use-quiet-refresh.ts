"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { quietRefresher } from "./quiet-refresh-rules";

/**
 * The server's copy of the page after saves, without a render per save. An
 * autosave no longer makes the server render the page (updateArtifactAction
 * revalidates nothing): the editor already shows what was saved. `soon` asks
 * for the page once the saves go quiet (quiet-refresh-rules.ts), so what the
 * server draws around the editor, and the pages the browser keeps for Back,
 * catch up; `now` asks at once, for a change that reaches the page outside
 * the autosave (a restore, a newer save the page took when its tab came
 * back, the "Made with" choice). What the autosave itself hands back goes
 * through `soon`, someone else's newer version it merged or loaded
 * included: the editor shows that at once from its own copy. Leaving with
 * a refresh still owed asks at once: the request is for the page being
 * opened, and it makes the browser drop the pages it kept, so Back asks the
 * server for this one again (e2e/autosave-refresh-db.spec.ts). `enabled`
 * false does nothing: the dev fixtures have no server copy.
 */
export function useQuietRefresh(enabled = true) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  // One for the life of the component; the router and startRefresh never change.
  const [refresher] = useState(() => quietRefresher((leaving) => {
    // Leaving: not in a transition, since this component's own are dropped with it.
    if (leaving) router.refresh();
    else startRefresh(() => { router.refresh(); });
  }));

  const soon = useCallback(() => { if (enabled) refresher.soon(); }, [enabled, refresher]);
  const now = useCallback(() => { if (enabled) refresher.now(); }, [enabled, refresher]);
  useEffect(() => () => { refresher.leave(); }, [refresher]);

  return { soon, now };
}
