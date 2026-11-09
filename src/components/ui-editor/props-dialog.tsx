"use client";

import { IconAlertTriangle, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { UiComponentName } from "@/lib/ui/catalog";
import { isPlainObject } from "@/lib/ui/json-walk";
import { describeProps, propsProblem, readTextOrNumber, scalarText } from "@/lib/ui/prop-fields";

import { FieldList } from "./prop-controls";

type Values = Record<string, unknown>;

/** Optional props left empty are dropped, so the spec keeps only what was set. */
function withoutUnset(values: Values): Values {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

/** The keys and labels of a Table's columns, as currently typed. */
function tableColumns(values: Values): { key: string; label: string }[] {
  const columns = Array.isArray(values.columns) ? values.columns.filter(isPlainObject) : [];
  return columns.map((column) => ({ key: typeof column.key === "string" ? column.key : "", label: typeof column.label === "string" ? column.label : "" }));
}

/** A Table's rows as a small grid: one input per cell, under its column's label. */
function TableRowsGrid({ values, onChange }: { values: Values; onChange: (values: Values) => void }) {
  const columns = tableColumns(values).filter((column) => column.key !== "");
  const rows = Array.isArray(values.rows) ? values.rows.filter(isPlainObject) : [];
  const [generation, setGeneration] = useState(0);
  const write = (next: Values[], reorder = false) => {
    if (reorder) setGeneration((count) => count + 1);
    onChange({ ...values, rows: next });
  };
  if (columns.length === 0) return <p className="text-sm text-muted-foreground">Add a column with a key to fill in rows.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {columns.map((column) => <th key={column.key} scope="col" className="px-1 pb-1 text-left text-xs font-medium text-muted-foreground">{column.label || column.key}</th>)}
              <th scope="col"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${String(generation)}-${String(index)}`}>
                {columns.map((column) => (
                  <td key={column.key} className="p-0.5">
                    <input
                      defaultValue={scalarText(row[column.key])}
                      aria-label={`${column.label || column.key}, row ${String(index + 1)}`}
                      onChange={(event) => { write(rows.map((old, at) => (at === index ? { ...old, [column.key]: readTextOrNumber(event.target.value, true) } : old))); }}
                      className="h-8 w-full min-w-20 rounded-md border bg-transparent px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                    />
                  </td>
                ))}
                <td className="p-0.5">
                  <Button variant="ghost" size="icon-xs" aria-label={`Remove row ${String(index + 1)}`} onClick={() => { write(rows.filter((_, at) => at !== index), true); }}><IconTrash /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="w-fit" onClick={() => { write([...rows, {}]); }}><IconPlus /> Add row</Button>
    </div>
  );
}

interface PropsFormProps {
  type: UiComponentName;
  props: Values;
  /** Called with props that pass the component's schema and rules; nothing invalid is ever sent. */
  onValid: (props: Values) => void;
}

/**
 * Every prop of one block as a form, drawn from its schema. Each change that
 * leaves the props valid applies at once; while they are not, the reason
 * shows under the form and the block keeps its last valid props.
 */
export function PropsForm({ type, props, onValid }: PropsFormProps) {
  const fields = useMemo(() => describeProps(type), [type]);
  const [values, setValues] = useState<Values>(props);
  const [problem, setProblem] = useState<string | null>(null);
  const change = (next: Values) => {
    setValues(next);
    const cleaned = withoutUnset(next);
    const found = propsProblem(type, cleaned);
    setProblem(found);
    if (!found) onValid(cleaned);
  };
  const isTable = type === "Table";
  return (
    <form noValidate onSubmit={(event) => { event.preventDefault(); }} className="flex flex-col gap-4">
      <FieldList fields={fields} values={values} onChange={change} skip={isTable ? new Set(["rows"]) : undefined} />
      {isTable ? (
        <section aria-label="Rows" className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Rows</h3>
          <TableRowsGrid values={values} onChange={change} />
        </section>
      ) : null}
      <p role="status" aria-live="polite" className="flex min-h-5 items-start gap-1.5 text-sm text-muted-foreground">
        {problem ? <><IconAlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-tone-warning" /> Not saved yet: {problem}</> : "Changes save as you type."}
      </p>
    </form>
  );
}

interface PropsDialogProps {
  /** The block being edited, or null while the dialog is closed. */
  block: { key: string; type: UiComponentName; props: Values } | null;
  onValid: (key: string, props: Values) => void;
  onClose: () => void;
}

/** The properties of one block, for the data a block shows (a chart's series, a table's rows, a tab's label). */
export function PropsDialog({ block, onValid, onClose }: PropsDialogProps) {
  return (
    <Dialog open={block !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {block ? (
          <>
            <DialogHeader>
              <DialogTitle>{`Edit ${block.type}`}</DialogTitle>
              <DialogDescription>Every change shows on the page at once and saves on its own.</DialogDescription>
            </DialogHeader>
            <PropsForm key={block.key} type={block.type} props={block.props} onValid={(props) => { onValid(block.key, props); }} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
