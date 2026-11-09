"use client";

import type { BaseComponentProps } from "@json-render/react";
import { useBoundProp } from "@json-render/react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Component, useState, type ComponentType, type ReactNode } from "react";
import type { z } from "zod";

import { componentChecks, componentProps, type UiComponentName, type UiProps } from "@/lib/ui/catalog";
import { formatPath } from "@/lib/ui/issues";

/** What every stout component view receives: parsed props with defaults still to apply. */
export interface ViewProps<K extends UiComponentName> {
  props: UiProps<K>;
  children?: ReactNode;
  emit: (event: string) => void;
  bindings?: Record<string, string> | undefined;
}

/** A small inline notice in place of one element that could not be shown. */
export function ElementNotice({ type, detail }: { type: string; detail?: string }) {
  return (
    <div role="note" className="flex min-w-0 items-start gap-2 rounded-md border border-dashed px-3 py-2 text-sm leading-5 text-muted-foreground">
      <IconAlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-tone-warning" />
      <span className="min-w-0 break-words">
        This {type} could not be shown.{detail ? ` ${detail}` : ""}
      </span>
    </div>
  );
}

interface BoundaryProps {
  type: string;
  children: ReactNode;
}

/** Catches a render error in one element so the rest of the page still renders. */
class ElementBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? <ElementNotice type={this.props.type} /> : this.props.children;
  }
}

function withoutNulls(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== null && value !== undefined));
}

function firstProblem(type: UiComponentName, props: Record<string, unknown>): { data: unknown } | { problem: string } {
  const schema: z.ZodType = componentProps[type];
  const parsed = schema.safeParse(props);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? formatPath(issue.path) : "";
    return { problem: issue ? `${where ? `${where}: ` : ""}${issue.message}` : "Its props are invalid." };
  }
  const problem = componentChecks[type]?.(props)[0];
  return problem ? { problem } : { data: parsed.data };
}

/**
 * Renders one catalog component the stout way: props are checked again after
 * expressions resolve, invalid props show a small notice instead of throwing,
 * and the view sits behind its own error boundary.
 */
export function renderStout<K extends UiComponentName>(type: K, context: BaseComponentProps, View: ComponentType<ViewProps<K>>): ReactNode {
  return renderStoutView(type, { props: context.props, children: context.children, emit: context.emit, bindings: context.bindings }, View);
}

/** What renderStoutView needs: the element's props as written or resolved, its rendered children, and its event emitter. */
export interface StoutInput {
  props: Record<string, unknown>;
  children?: ReactNode;
  emit: (event: string) => void;
  bindings?: Record<string, string> | undefined;
}

/** renderStout without json-render's renderer context, for the interface editor, which walks the spec itself. */
export function renderStoutView<K extends UiComponentName>(type: K, input: StoutInput, View: ComponentType<ViewProps<K>>): ReactNode {
  const checked = firstProblem(type, withoutNulls(input.props));
  if ("problem" in checked) return <ElementNotice type={type} detail={checked.problem.slice(0, 200)} />;
  return (
    <ElementBoundary type={type}>
      <View props={checked.data as UiProps<K>} emit={input.emit} bindings={input.bindings}>
        {input.children}
      </View>
    </ElementBoundary>
  );
}

/**
 * An input value that writes back to spec state when the prop is bound with
 * `$bindState`, and otherwise lives in local component state.
 */
export function useInputValue<T>(propValue: T | undefined, bindingPath: string | undefined, fallback: T): [T, (value: T) => void] {
  const [local, setLocal] = useState<T>(propValue ?? fallback);
  const [, setBound] = useBoundProp<T>(propValue, bindingPath);
  if (bindingPath) return [propValue ?? fallback, setBound];
  return [local, setLocal];
}
