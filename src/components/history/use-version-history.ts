import { useCallback, useRef, useState } from "react";

import type { ActionResult, VersionDetailDto, VersionSummaryDto } from "@/lib/artifact-types";
import { getVersionAction, listVersionsAction } from "@/lib/versions/actions";

const OFFLINE = "Something went wrong. Check your connection and try again.";

async function settle<T>(call: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await call();
  } catch {
    return { success: false, error: OFFLINE };
  }
}

/**
 * Loads an artifact's history for the history dialog: the list once it
 * opens, and each version's content the first time it is needed. Loads run
 * from event handlers, never effects.
 */
export function useVersionHistory(publicId: string) {
  const [versions, setVersions] = useState<VersionSummaryDto[] | null>(null);
  const [listError, setListError] = useState("");
  const [details, setDetails] = useState<ReadonlyMap<string, VersionDetailDto>>(new Map());
  const [detailError, setDetailError] = useState("");
  const loading = useRef(new Set<string>());

  const loadDetails = useCallback(async (ids: readonly string[]) => {
    const missing = ids.filter((id) => !details.has(id) && !loading.current.has(id));
    if (missing.length === 0) return;
    for (const id of missing) loading.current.add(id);
    const results = await Promise.all(missing.map((id) => settle(() => getVersionAction(publicId, id))));
    for (const id of missing) loading.current.delete(id);
    const loaded = results.flatMap((result) => (result.success ? [result.data] : []));
    setDetailError(results.flatMap((result) => (result.success ? [] : [result.error]))[0] ?? "");
    if (loaded.length > 0) setDetails((current) => new Map([...current, ...loaded.map((detail) => [detail.id, detail] as const)]));
  }, [details, publicId]);

  /** Loads (or reloads) the list. Resolves with the versions, or null on failure. */
  const loadList = useCallback(async () => {
    setListError("");
    const result = await settle(() => listVersionsAction(publicId));
    if (!result.success) {
      setListError(result.error);
      return null;
    }
    setVersions(result.data);
    return result.data;
  }, [publicId]);

  return { versions, listError, details, detailError, loadList, loadDetails };
}
