/**
 * Lets an owner's script run the app's own service code (src/lib) in plain
 * Node, outside Next.js. Node already strips TypeScript types; these hooks
 * add what Next's bundler (and Vitest's alias) normally supply:
 *
 * - `@/x` resolves to `src/x`, and a relative import without an extension
 *   finds its `.ts`, `.tsx`, or `index.ts` file, as the bundler does.
 * - `next/<name>` resolves to Next's own `next/<name>.js` file, which Node
 *   needs spelled out because the package has no exports map.
 * - `react` is served as an ES module that re-exports React's CommonJS
 *   build, whose named exports (such as `cache`) Node cannot detect.
 *
 * Nothing here changes what the app code does: outside a request, React's
 * `cache` runs the function each time and Next's `after` is not available,
 * which the app already handles (src/lib/notifications/after-response.ts).
 */
import { existsSync, statSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = resolvePath(repoRoot, "src");
const sourceRootUrl = `${pathToFileURL(sourceRoot).href}/`;
const sourceSuffixes =[".ts", ".tsx", "/index.ts", "/index.tsx"];
const packageJsonUrl = pathToFileURL(resolvePath(repoRoot, "package.json")).href;
const reactShimUrl = "app-module-hooks:react";
const nextServerShimUrl = "app-module-hooks:next-server";
const nextSubpath = /^next\/[a-z-]+$/;

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/** The file a bundler would pick for this path: itself, or with a source suffix. */
function sourceFile(base: string): string | null {
  if (isFile(base)) return base;
  for (const suffix of sourceSuffixes) if (isFile(base + suffix)) return base + suffix;
  return null;
}

/** The source file an app specifier names, or null when Node should resolve it as it is. */
function appSourceFile(specifier: string, parentUrl: string | undefined): string | null {
  if (specifier.startsWith("@/")) return sourceFile(resolvePath(sourceRoot, specifier.slice(2)));
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if (!relative || !parentUrl?.startsWith(sourceRootUrl)) return null;
  return sourceFile(resolvePath(dirname(fileURLToPath(parentUrl)), specifier));
}

/** The names a CommonJS package exports that can be re-exported by name. */
function exportedNames(specifier: string): string[] {
  const exported = createRequire(packageJsonUrl)(specifier) as Record<string, unknown>;
  return Object.keys(exported).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== "default");
}

/** An ES module that re-exports every named export of React's CommonJS build. */
function reactShimSource(): string {
  return [
    `import { createRequire } from "node:module";`,
    `const react = createRequire(${JSON.stringify(packageJsonUrl)})("react");`,
    `export default react;`,
    ...exportedNames("react").map((name) => `export const ${name} = react.${name};`),
  ].join("\n");
}

/** The work handed to `after`, for settleAfterTasks. The shim finds it on globalThis under this key. */
const afterTasksKey = Symbol.for("artifacts-space.app-module-hooks.after");
const afterTasks: Promise<unknown>[] = [];

/**
 * Next's `next/server` for app modules, with `after` kept: Next runs that work
 * once the response is sent, and a script has no response, so the work starts
 * at once (as the app does outside a request) and settleAfterTasks waits for it.
 */
function nextServerShimSource(): string {
  return [
    `import { createRequire } from "node:module";`,
    `const server = createRequire(${JSON.stringify(packageJsonUrl)})("next/server.js");`,
    `const tasks = globalThis[Symbol.for(${JSON.stringify(afterTasksKey.description)})];`,
    ...exportedNames("next/server.js").filter((name) => name !== "after").map((name) => `export const ${name} = server.${name};`),
    `export function after(task) { tasks.push(Promise.resolve().then(() => (typeof task === "function" ? task() : task))); }`,
  ].join("\n");
}

/** Waits until all work handed to `after` has finished, including work that work handed on. */
export async function settleAfterTasks(): Promise<void> {
  while (afterTasks.length > 0) await Promise.allSettled(afterTasks.splice(0));
}

/** Registers the hooks for this process. Call it before importing any app module. */
export function registerAppModuleHooks(): void {
  Reflect.set(globalThis, afterTasksKey, afterTasks);
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const fromApp = context.parentURL?.startsWith(sourceRootUrl) === true;
      if (fromApp && specifier === "react") return { url: reactShimUrl, shortCircuit: true };
      if (fromApp && specifier === "next/server") return { url: nextServerShimUrl, shortCircuit: true };
      const file = appSourceFile(specifier, context.parentURL);
      if (file) return nextResolve(pathToFileURL(file).href, context);
      if (nextSubpath.test(specifier)) return nextResolve(`${specifier}.js`, context);
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url === reactShimUrl) return { format: "module", source: reactShimSource(), shortCircuit: true };
      if (url === nextServerShimUrl) return { format: "module", source: nextServerShimSource(), shortCircuit: true };
      return nextLoad(url, context);
    },
  });
}
