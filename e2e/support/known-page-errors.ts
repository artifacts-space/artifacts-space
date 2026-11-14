import type { PageErrorAllowance } from "./page-error-rules";

/**
 * Errors every spec lets pass: noise we cannot fix in our code. Keep this
 * short, give each entry a one-line reason, and fix the cause instead when
 * it is ours. A test that causes an error on purpose calls `allowPageError`
 * in that test instead of adding it here.
 */
export const knownPageErrors: readonly PageErrorAllowance[] = [];
