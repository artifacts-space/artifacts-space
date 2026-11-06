"use client";

import { JSONUIProvider, Renderer } from "@json-render/react";
import { useMemo } from "react";

import { toRendererSpec } from "@/lib/ui/spec";
import { validateUiSpec } from "@/lib/ui/validate";

import { UnknownComponent, uiRegistry } from "./ui/registry";
import { IssueList, ViewNotice } from "./view-notice";

const noHandlers = {};

/**
 * Renders a ui artifact (a json-render spec) with the stout registry. A spec
 * that cannot render at all shows its validation issues instead. A spec that
 * renders with some broken elements shows a short note above it; each broken
 * element shows its own inline notice.
 */
export function UiView({ content }: { content: string }) {
  const result = useMemo(() => validateUiSpec(content), [content]);
  const errors = result.issues.filter((issue) => issue.severity === "error");
  if (!result.renderable || !result.spec) {
    return (
      <ViewNotice tone="warning" title="This interface could not be shown.">
        <IssueList issues={result.issues} />
      </ViewNotice>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {errors.length > 0 ? (
        <ViewNotice tone="warning" title={`${String(errors.length)} ${errors.length === 1 ? "part" : "parts"} of this interface could not be shown.`}>
          <details>
            <summary className="cursor-pointer select-none">Show details</summary>
            <IssueList issues={errors} />
          </details>
        </ViewNotice>
      ) : null}
      <JSONUIProvider key={content} registry={uiRegistry} initialState={result.spec.state ?? {}} handlers={noHandlers}>
        <Renderer spec={toRendererSpec(result.spec)} registry={uiRegistry} fallback={UnknownComponent} />
      </JSONUIProvider>
    </div>
  );
}
