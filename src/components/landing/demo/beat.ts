import type { CSSProperties } from "react";

/**
 * The inline style that times one element of the demo replay: it lands at
 * `inAt` seconds and, when `outAt` is given, leaves again at `outAt`.
 * demo.css reads `--d-in` and `--d-out`. Elements with `--d-out` are hidden
 * in the finished (server-rendered) state.
 */
export function beat(inAt: number, outAt?: number): CSSProperties {
  const vars: Record<string, number> = { "--d-in": inAt };
  if (outAt !== undefined) vars["--d-out"] = outAt;
  return vars;
}
