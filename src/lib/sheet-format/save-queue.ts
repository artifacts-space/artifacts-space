/*
 * Saves that never overlap. A setting saved as one whole object (sheet
 * formatting) must not race itself: if two saves were in flight at once and
 * the older landed last, the newer change would be lost with no warning.
 * The queue sends one save at a time; a change made while one is in flight
 * waits, and only the newest waiting change is sent once the line is free.
 */

/** Saves a value; resolves to the value as saved, or null when it did not save (and the saver told the person why). */
export type QueuedSaver<T> = (next: T) => Promise<T | null>;

export interface SaveQueueHandlers<T> {
  /** The value to show once every change has settled: the saved one, or the last saved one after a failure. */
  onSettled: (value: T) => void;
  /** Called once for each save that threw. */
  onFailed: (error: unknown) => void;
}

export interface SaveQueue<T> {
  /** Shows nothing itself; sends the change through `save` now, or after the one in flight. */
  push: (next: T, save: QueuedSaver<T>) => void;
  /** The value the server now holds, so a failed save rolls back to the truth. */
  reset: (value: T) => void;
}

/**
 * A line for whole-object saves: one in flight, at most one waiting (the
 * newest), the rest dropped because the newest already includes them. When
 * the line empties, `onSettled` gets the value to show: what the server
 * saved, or, after a failure, what it last saved.
 */
export function createSaveQueue<T>(initial: T, handlers: SaveQueueHandlers<T>): SaveQueue<T> {
  let saved = initial;
  let inFlight = false;
  let waiting: { value: T; save: QueuedSaver<T> } | null = null;

  const settle = (value: T) => {
    inFlight = false;
    if (waiting) {
      const next = waiting;
      waiting = null;
      run(next.value, next.save);
      return;
    }
    handlers.onSettled(value);
  };

  const run = (next: T, save: QueuedSaver<T>) => {
    inFlight = true;
    // Inside a promise, so a saver that throws before it returns one still settles the line.
    new Promise<T | null>((resolve) => { resolve(save(next)); })
      .then((result) => {
        if (result !== null) saved = result;
        settle(result ?? saved);
      })
      .catch((error: unknown) => {
        handlers.onFailed(error);
        settle(saved);
      });
  };

  return {
    push: (next, save) => {
      if (inFlight) {
        waiting = { value: next, save };
        return;
      }
      run(next, save);
    },
    reset: (value) => {
      saved = value;
    },
  };
}
