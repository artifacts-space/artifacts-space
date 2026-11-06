import type { Spec } from "@json-render/core";

import { isPlainObject } from "./json-walk";

/** One element of a ui spec, after normalization. */
export interface UiElement {
  type: string;
  props: Record<string, unknown>;
  children: string[];
  visible?: unknown;
  repeat?: unknown;
  on?: unknown;
}

/** A ui spec: a flat map of elements, a root key, optional initial state, and the component-set version. */
export interface UiSpec {
  version: number;
  root: string;
  elements: Record<string, UiElement>;
  state?: Record<string, unknown>;
}

/** Element fields we pass through to the renderer. Anything else is dropped. */
const passThroughFields = ["visible", "repeat", "on"] as const;

/** Drops props set to null, so `null` reads the same as leaving a prop out. */
function withoutNulls(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== null));
}

/**
 * Normalizes one raw element: props default to {}, null props are dropped,
 * and a missing `children` becomes []. Returns null when `raw` is not an
 * element at all.
 */
export function normalizeElement(raw: unknown): UiElement | null {
  if (!isPlainObject(raw) || typeof raw.type !== "string") return null;
  const element: UiElement = {
    type: raw.type,
    props: isPlainObject(raw.props) ? withoutNulls(raw.props) : {},
    children: Array.isArray(raw.children) ? raw.children.filter((child): child is string => typeof child === "string") : [],
  };
  for (const field of passThroughFields) {
    if (raw[field] !== undefined) element[field] = raw[field];
  }
  return element;
}

/** The spec in the shape `@json-render/react`'s Renderer expects. */
export function toRendererSpec(spec: UiSpec): Spec {
  return spec as unknown as Spec;
}
