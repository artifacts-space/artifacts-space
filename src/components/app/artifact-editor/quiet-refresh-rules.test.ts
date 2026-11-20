import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTOSAVE_MAX_WAIT_MS, AUTOSAVE_MIN_INTERVAL_MS } from "./autosave-rules";
import { QUIET_REFRESH_MS, quietRefresher } from "./quiet-refresh-rules";

describe("quietRefresher", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("should wait well past the longest gap between two autosaves, so typing that goes on renders nothing even when a save answers late", () => {
    expect(QUIET_REFRESH_MS).toBeGreaterThanOrEqual(AUTOSAVE_MAX_WAIT_MS + AUTOSAVE_MIN_INTERVAL_MS);
  });

  it("should ask once, after the saves go quiet, when several saves follow each other", () => {
    const run = vi.fn();
    const refresher = quietRefresher(run);
    refresher.soon();
    vi.advanceTimersByTime(AUTOSAVE_MAX_WAIT_MS);
    refresher.soon();
    vi.advanceTimersByTime(AUTOSAVE_MAX_WAIT_MS);
    refresher.soon();
    vi.advanceTimersByTime(QUIET_REFRESH_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(false);
    vi.advanceTimersByTime(QUIET_REFRESH_MS * 2);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("should ask at once, and not again later, when a change the editor does not show arrives while one is owed", () => {
    const run = vi.fn();
    const refresher = quietRefresher(run);
    refresher.soon();
    refresher.now();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(QUIET_REFRESH_MS * 2);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("should ask at once when the page goes away with a refresh still owed", () => {
    const run = vi.fn();
    const refresher = quietRefresher(run);
    refresher.soon();
    refresher.leave();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(QUIET_REFRESH_MS * 2);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("should ask for nothing when the page goes away with no save since the last refresh", () => {
    const run = vi.fn();
    const refresher = quietRefresher(run);
    refresher.leave();
    refresher.soon();
    vi.advanceTimersByTime(QUIET_REFRESH_MS);
    refresher.leave();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(false);
  });
});
