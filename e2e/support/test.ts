import { test as base, type Browser, type BrowserContext, type TestInfo } from "@playwright/test";

import { knownPageErrors } from "./known-page-errors";
import {
  consoleMessageKind,
  pageErrorReport,
  unexpectedPageErrors,
  type PageError,
  type PageErrorAllowance,
} from "./page-error-rules";

export { expect } from "@playwright/test";

/** Errors each running test allows on purpose, by its TestInfo. */
const allowancesByTest = new WeakMap<TestInfo, PageErrorAllowance[]>();

/** Errors each running test's pages reported so far, by its TestInfo. */
const errorsByTest = new WeakMap<TestInfo, PageError[]>();

/** The message the fixture fails the test with, or null when every error was allowed. */
function failureReport(testInfo: TestInfo): string | null {
  const allowances = [...knownPageErrors, ...(allowancesByTest.get(testInfo) ?? [])];
  const unexpected = unexpectedPageErrors(errorsByTest.get(testInfo) ?? [], allowances);
  return unexpected.length > 0 ? pageErrorReport(unexpected, allowances) : null;
}

/** Reports every uncaught exception and error-level console message from any page of a context. */
function watchContext(context: BrowserContext, errors: PageError[]): void {
  context.on("weberror", (webError) => {
    const error = webError.error();
    errors.push({ kind: "pageerror", text: error.stack ?? error.message, url: webError.page()?.url() ?? "" });
  });
  context.on("console", (message) => {
    const kind = consoleMessageKind(message.type(), message.text());
    if (!kind) return;
    errors.push({ kind, text: message.text(), url: message.location().url || (message.page()?.url() ?? "") });
  });
}

/**
 * Watches contexts a test opens itself with `browser.newContext()` or
 * `browser.newPage()` (which calls `newContext`), until the returned
 * function puts the browser's own method back.
 */
function watchNewContexts(browser: Browser, errors: PageError[]): () => void {
  const original = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await original(options);
    watchContext(context, errors);
    return context;
  };
  return () => {
    Reflect.deleteProperty(browser, "newContext");
  };
}

/**
 * Every spec imports `test` and `expect` from here, never from
 * `@playwright/test`. The auto fixture `failOnPageErrors` collects uncaught
 * page errors and `console.error` messages (hydration warnings included) from
 * every page the test opens, and fails the test at the end, naming the
 * first few and the allowances in force.
 */
export const test = base.extend<{ failOnPageErrors: undefined }>({
  failOnPageErrors: [
    async ({ context, browser }, use, testInfo) => {
      const errors: PageError[] = [];
      errorsByTest.set(testInfo, errors);
      watchContext(context, errors);
      const restore = watchNewContexts(browser, errors);
      // `use` resolves when the test ends, whether it passed or failed.
      await use(undefined);
      restore();
      const report = failureReport(testInfo);
      if (report) throw new Error(report);
    },
    { auto: true },
  ],
});

/**
 * Lets the running test pass with page errors it causes on purpose, such as
 * an aborted route or blocked storage. `pattern` is a RegExp or a substring,
 * matched against the error's text and, separately, the URL it came from (a
 * failed request's URL); `reason` says why the error is expected. Call it
 * inside the test (or a helper the test calls), before or after the error.
 */
export function allowPageError(pattern: RegExp | string, reason: string): void {
  const info = test.info();
  const allowances = allowancesByTest.get(info) ?? [];
  allowances.push({ pattern, reason });
  allowancesByTest.set(info, allowances);
}

/**
 * The message the running test would fail with if it ended now, or null
 * when it would pass. Only `e2e/page-errors.spec.ts` needs it, to check the
 * message itself.
 */
export function pageErrorReportSoFar(): string | null {
  return failureReport(test.info());
}
