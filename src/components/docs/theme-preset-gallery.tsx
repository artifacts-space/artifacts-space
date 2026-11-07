"use client";

import { useEffect, useRef, useState } from "react";

import { ThemeScope } from "@/components/artifact-view/theme-scope";
import { CopyIconButton } from "@/components/copy-icon-button";
import { themePresetSummaries, type ThemePresetSummary } from "@/lib/themes/artifact-theme";
import type { PaletteMode } from "@/lib/themes/derive";
import { presetTheme } from "@/lib/themes/resolve";

/**
 * True once the element comes near the viewport, and from then on. Samples
 * mount only then, so a preset's fonts load only when a reader scrolls to it.
 */
function useNearViewport<T extends Element>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setNear(true);
      observer.disconnect();
    }, { rootMargin: "300px 0px" });
    observer.observe(node);
    return () => { observer.disconnect(); };
  }, []);
  return { ref, near };
}

const seriesClasses = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4", "bg-series-5", "bg-series-6"] as const;

/** One mode of one preset, drawn by the real ThemeScope: page, card, text, accent, chart colors, and code font. */
function ModeSample({ presetId, mode }: { presetId: string; mode: PaletteMode }) {
  const theme = presetTheme(presetId);
  if (!theme) return null;
  return (
    <ThemeScope theme={theme} mode={mode} className="min-w-0 bg-background p-3 text-foreground" data-theme-sample={presetId} data-theme-sample-mode={mode}>
      <p className="font-mono text-xs text-muted-foreground">{mode === "light" ? "Light" : "Dark"}</p>
      <div className="card-nested mt-2 rounded-lg bg-card p-3">
        <p className="font-heading text-lg leading-tight font-medium tracking-[-0.01em]">Launch plan</p>
        <p className="mt-1 text-sm text-muted-foreground">Three steps, ready for review.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-primary px-2.5 py-1 text-xs text-primary-foreground">Approve</span>
          <span className="flex items-center gap-1" aria-hidden>
            {seriesClasses.map((name) => <span key={name} className={`size-2.5 rounded-full ${name}`} />)}
          </span>
        </div>
        <code className="mt-3 block truncate font-mono text-xs text-muted-foreground">theme: &quot;{presetId}&quot;</code>
      </div>
    </ThemeScope>
  );
}

function fontLine(preset: ThemePresetSummary): string {
  const { heading, body, mono } = preset.fonts;
  const text = heading.id === body.id ? body.family : `${heading.family} and ${body.family}`;
  return `${text}, code in ${mono.family}`;
}

/** One preset: light and dark samples once near the viewport, then its name, id (with copy), fonts, and look. */
function PresetCard({ preset }: { preset: ThemePresetSummary }) {
  const { ref, near } = useNearViewport<HTMLLIElement>();
  return (
    <li ref={ref} className="card-surface flex min-w-0 flex-col overflow-hidden" data-theme-preset={preset.id}>
      <div className="grid min-h-44 grid-cols-2 border-b border-card-edge" aria-hidden>
        {near ? (
          <>
            <ModeSample presetId={preset.id} mode="light" />
            <ModeSample presetId={preset.id} mode="dark" />
          </>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-md font-medium">{preset.name}</h3>
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">{preset.id}</code>
          <CopyIconButton value={preset.id} label={`Copy the ${preset.name} preset id`} className="ml-auto" />
        </div>
        <p className="text-sm text-muted-foreground">{preset.description}</p>
        <p className="text-xs text-muted-foreground">{fontLine(preset)}</p>
      </div>
    </li>
  );
}

/**
 * Every built-in preset as a live sample in light and dark, drawn by the same
 * ThemeScope the artifact page uses, so what you see is what readers get.
 */
export function ThemePresetGallery() {
  const presets = themePresetSummaries();
  return (
    <ul aria-label="Theme presets" className="mt-6 grid gap-4 sm:grid-cols-2">
      {presets.map((preset) => <PresetCard key={preset.id} preset={preset} />)}
    </ul>
  );
}
