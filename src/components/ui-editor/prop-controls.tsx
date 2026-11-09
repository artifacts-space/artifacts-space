"use client";

import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@tabler/icons-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isPlainObject } from "@/lib/ui/json-walk";
import { readLines, readTextOrNumber, scalarText, writeLines, type FieldModel, type PropField } from "@/lib/ui/prop-fields";

/*
 * Controls for one prop in the properties form, chosen from its field model
 * (src/lib/ui/prop-fields.ts). Each reports the new value as typed; the form
 * checks the whole set of props before anything is saved.
 */

type Values = Record<string, unknown>;

/** The value "not set" options show for an optional choice. */
const unset = "__unset";

/** A starting value for a new row's field, valid where the schema allows it. */
function emptyValue(model: FieldModel): unknown {
  if (model.kind === "number") return model.min ?? 0;
  if (model.kind === "boolean") return false;
  if (model.kind === "choice") return model.options[0];
  if (model.kind === "rows" || model.kind === "lines") return [];
  return "";
}

/** A new row with every required field filled in. */
function emptyRow(fields: readonly PropField[]): Values {
  return Object.fromEntries(fields.filter((field) => !field.optional).map((field) => [field.name, emptyValue(field.model)]));
}

interface ControlProps {
  id: string;
  field: PropField;
  value: unknown;
  onChange: (value: unknown) => void;
}

function TextControl({ id, field, value, onChange }: ControlProps & { field: PropField & { model: { kind: "text" } } }) {
  const text = typeof value === "string" ? value : "";
  const write = (next: string) => { onChange(field.optional && next === "" ? undefined : next); };
  if (field.model.multiline) return <Textarea id={id} value={text} maxLength={field.model.max} onChange={(event) => { write(event.target.value); }} className="min-h-20 text-base md:text-sm" />;
  return <Input id={id} value={text} maxLength={field.model.max} onChange={(event) => { write(event.target.value); }} className="h-8 text-base md:text-sm" />;
}

function NumberControl({ id, field, value, onChange }: ControlProps) {
  const [text, setText] = useState(typeof value === "number" ? String(value) : "");
  return (
    <Input
      id={id}
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const trimmed = event.target.value.trim();
        onChange(trimmed === "" && field.optional ? undefined : Number(trimmed));
      }}
      className="h-8 text-base md:text-sm"
    />
  );
}

function BooleanControl({ id, field, value, onChange }: ControlProps) {
  return <Checkbox id={id} checked={value === true} onCheckedChange={(checked) => { onChange(field.optional && !checked ? undefined : checked); }} />;
}

function ChoiceControl({ id, field, value, onChange }: ControlProps & { field: PropField & { model: { kind: "choice" } } }) {
  const current = typeof value === "string" ? value : unset;
  return (
    <Select value={current} onValueChange={(next) => { if (next !== null) onChange(next === unset ? undefined : next); }}>
      <SelectTrigger id={id} className="h-8 w-full text-sm"><SelectValue>{(shown: string) => (shown === unset ? "Default" : shown)}</SelectValue></SelectTrigger>
      <SelectContent>
        {field.optional ? <SelectItem value={unset}>Default</SelectItem> : null}
        {field.model.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function LinesControl({ id, value, onChange, item }: ControlProps & { item: "text" | "number" | "numberOrEmpty" }) {
  const [text, setText] = useState(() => writeLines(value));
  return (
    <Textarea
      id={id}
      value={text}
      onChange={(event) => { setText(event.target.value); onChange(readLines(event.target.value, item)); }}
      className="min-h-20 font-mono text-base md:text-sm"
      aria-describedby={`${id}-hint`}
    />
  );
}

/** A list of objects: each row's fields, with move, remove, and add (unless the rows pair with child blocks). */
function RowsControl({ field, value, onChange, fields, fixed }: ControlProps & { fields: readonly PropField[]; fixed: boolean }) {
  const rows = Array.isArray(value) ? value.filter(isPlainObject) : [];
  // Rows have no ids; a new generation after a move or removal resets the fields that keep their own text.
  const [generation, setGeneration] = useState(0);
  const write = (next: Values[], reorder = false) => {
    if (reorder) setGeneration((count) => count + 1);
    onChange(next);
  };
  const move = (from: number, to: number) => {
    const next = [...rows];
    const [row] = next.splice(from, 1);
    if (row) next.splice(to, 0, row);
    write(next, true);
  };
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <fieldset key={`${String(generation)}-${String(index)}`} className="card-nested flex flex-col gap-2 rounded-lg p-3">
          <legend className="sr-only">{`${field.label} ${String(index + 1)}`}</legend>
          <div className="flex items-center gap-1">
            <span className="mr-auto text-xs text-muted-foreground">{`${field.label} ${String(index + 1)}`}</span>
            {fixed ? null : (
              <>
                <Button variant="ghost" size="icon-xs" aria-label={`Move ${field.label} ${String(index + 1)} up`} disabled={index === 0} onClick={() => { move(index, index - 1); }}><IconArrowUp /></Button>
                <Button variant="ghost" size="icon-xs" aria-label={`Move ${field.label} ${String(index + 1)} down`} disabled={index === rows.length - 1} onClick={() => { move(index, index + 1); }}><IconArrowDown /></Button>
                <Button variant="ghost" size="icon-xs" aria-label={`Remove ${field.label} ${String(index + 1)}`} onClick={() => { write(rows.filter((_, at) => at !== index), true); }}><IconTrash /></Button>
              </>
            )}
          </div>
          <FieldList fields={fields} values={row} onChange={(next) => { write(rows.map((old, at) => (at === index ? next : old))); }} />
        </fieldset>
      ))}
      {fixed ? null : (
        <Button variant="outline" size="sm" className="w-fit" onClick={() => { write([...rows, emptyRow(fields)]); }}>
          <IconPlus /> Add {field.label.toLowerCase().replace(/s$/, "")}
        </Button>
      )}
    </div>
  );
}

/** The hint under a field whose value is a list typed one per line. */
function linesHint(item: "text" | "number" | "numberOrEmpty") {
  if (item === "text") return "One per line.";
  return item === "number" ? "One number per line." : "One number per line. Leave a line empty for a gap.";
}

function FieldControl(props: ControlProps) {
  const { field } = props;
  const model = field.model;
  switch (model.kind) {
    case "text": return <TextControl {...props} field={{ ...field, model }} />;
    case "number": return <NumberControl {...props} />;
    case "boolean": return <BooleanControl {...props} />;
    case "choice": return <ChoiceControl {...props} field={{ ...field, model }} />;
    case "textOrNumber": return <Input id={props.id} defaultValue={scalarText(props.value)} onChange={(event) => { props.onChange(readTextOrNumber(event.target.value, model.nullable)); }} className="h-8 text-base md:text-sm" />;
    case "lines": return <LinesControl {...props} item={model.item} />;
    case "rows": return <RowsControl {...props} fields={model.fields} fixed={model.fixed} />;
    case "unsupported": return <p className="text-sm text-muted-foreground">Edit this in View source.</p>;
  }
}

/** Labelled controls for a set of fields, such as a component's props or one row of a list. */
export function FieldList({ fields, values, onChange, skip }: { fields: readonly PropField[]; values: Values; onChange: (values: Values) => void; skip?: ReadonlySet<string> | undefined }) {
  const baseId = useId();
  return (
    <div className="flex flex-col gap-3">
      {fields.filter((field) => !skip?.has(field.name)).map((field) => {
        const id = `${baseId}-${field.name}`;
        const inline = field.model.kind === "boolean";
        return (
          <div key={field.name} className={inline ? "flex items-center gap-2" : "flex flex-col gap-1.5"}>
            <label htmlFor={id} className={inline ? "order-2 text-sm" : "text-xs font-medium text-muted-foreground"}>
              {field.label}{field.optional || inline ? "" : " *"}
            </label>
            <FieldControl id={id} field={field} value={values[field.name]} onChange={(value) => { onChange({ ...values, [field.name]: value }); }} />
            {field.model.kind === "lines" ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{linesHint(field.model.item)}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
