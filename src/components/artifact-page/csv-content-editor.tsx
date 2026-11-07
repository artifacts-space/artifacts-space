"use client";

import { IconCode, IconTable } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { ViewNotice } from "@/components/artifact-view/view-notice";
import { ContentEditor } from "@/components/editor/content-editor";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { csvTextStyle, parseCsv } from "@/lib/csv";
import { csvGridEditLimits } from "@/lib/csv-limits";
import type { FileDto } from "@/lib/files/types";

import { CsvGridEditor } from "./csv-grid-editor";

type Mode = "grid" | "raw";

interface CsvContentEditorProps {
  value: string;
  onChange: (value: string) => void;
  title: string;
  files: readonly FileDto[];
  label: string;
}

/** Why the grid cannot open this text, or null when it can. The Raw editor always can. */
export function csvGridProblem(text: string): string | null {
  const parsed = parseCsv(text, { maxRows: csvGridEditLimits.rows });
  if (parsed.errors.length > 0) return "A quoted field never closes, so the grid could misread it. Fix it here, then switch to Grid.";
  if (parsed.truncated || parsed.columnCount > csvGridEditLimits.columns) {
    return `The grid opens CSVs up to ${csvGridEditLimits.rows.toLocaleString("en-US")} rows and ${String(csvGridEditLimits.columns)} columns. Edit this one as text.`;
  }
  return null;
}

/**
 * The CSV editor on an artifact's page: a spreadsheet-style grid, with a Raw
 * switch to edit the text directly. Both edit the same text, which saves
 * through the page editor's usual save, history, and approval rules.
 */
export function CsvContentEditor({ value, onChange, title, files, label }: CsvContentEditorProps) {
  const problem = useMemo(() => csvGridProblem(value), [value]);
  const [mode, setMode] = useState<Mode>(() => (problem === null ? "grid" : "raw"));
  const [style, setStyle] = useState(() => csvTextStyle(value));
  const showGrid = mode === "grid" && problem === null;

  function changeMode(next: Mode) {
    if (next === "grid") setStyle(csvTextStyle(value));
    setMode(next);
  }

  const modeSwitch = (
    <Tabs value={showGrid ? "grid" : "raw"} onValueChange={(next: Mode) => { changeMode(next); }}>
      <TabsList aria-label={`${label}: edit as a grid or as text`}>
        <TabsTrigger value="grid" disabled={problem !== null} className="px-2.5"><IconTable aria-hidden /> Grid</TabsTrigger>
        <TabsTrigger value="raw" className="px-2.5"><IconCode aria-hidden /> Raw</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (showGrid) return <CsvGridEditor value={value} onChange={onChange} style={style} modeSwitch={modeSwitch} />;
  return (
    <div className="space-y-3">
      {modeSwitch}
      {problem ? <ViewNotice tone="warning" title="This CSV opens as text.">{problem}</ViewNotice> : null}
      <ContentEditor kind="csv" value={value} onChange={onChange} title={title} language="" files={files} label={label} autoFocus />
    </div>
  );
}
