import type { ConfirmationAction } from "./kinds";

/** A confirmed action. It resolves true when it finished and the dialog may close. */
export type ConfirmedRun = () => Promise<boolean>;

/**
 * Starts a destructive action. When the person turned this confirmation off,
 * the action runs now with no dialog; otherwise `ask` opens the dialog.
 */
export function requestConfirmation(
  skipped: ReadonlySet<ConfirmationAction>,
  action: ConfirmationAction,
  run: ConfirmedRun,
  ask: (run: ConfirmedRun) => void,
): "ran" | "asked" {
  if (skipped.has(action)) {
    void run();
    return "ran";
  }
  ask(run);
  return "asked";
}

/**
 * Runs a confirmed action. With "Don't ask again" ticked, the choice is saved
 * first, without waiting: a failed save never blocks the action.
 */
export function confirmAndRun({
  action,
  dontAskAgain,
  run,
  skip,
}: {
  action: ConfirmationAction;
  dontAskAgain: boolean;
  run: ConfirmedRun;
  skip: (action: ConfirmationAction) => void;
}): Promise<boolean> {
  if (dontAskAgain) skip(action);
  return run();
}

/**
 * Saves a skipped confirmation optimistically: `add` updates the screen at
 * once, and `remove` plus `onError` undo it when the save fails.
 */
export async function saveSkip({
  action,
  add,
  remove,
  save,
  onError,
}: {
  action: ConfirmationAction;
  add: (action: ConfirmationAction) => void;
  remove: (action: ConfirmationAction) => void;
  save: (action: ConfirmationAction) => Promise<{ success: boolean }>;
  onError: () => void;
}): Promise<boolean> {
  add(action);
  try {
    const result = await save(action);
    if (result.success) return true;
  } catch {
    // Reported below with the failed result.
  }
  remove(action);
  onError();
  return false;
}
