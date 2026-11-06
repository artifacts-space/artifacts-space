"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatNumber } from "@/lib/ui/number-format";
import { cn } from "@/lib/utils";

import { useInputValue, type ViewProps } from "./stout";

export function ChecklistView({ props }: ViewProps<"Checklist">) {
  const [checked, setChecked] = useState(() => props.items.map((item) => item.checked ?? false));
  const done = checked.filter(Boolean).length;
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="flex w-full items-baseline justify-between gap-3 text-md">
        <span className="min-w-0 font-medium break-words">{props.title ?? "Checklist"}</span>
        {props.items.length > 0 ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{done} of {props.items.length}</span> : null}
      </legend>
      {props.items.length === 0 ? <p className="text-sm text-muted-foreground">No items yet.</p> : null}
      <ul className="space-y-1.5">
        {props.items.map((item, index) => (
          <li key={`${String(index)}-${item.label.slice(0, 20)}`}>
            <label className="flex cursor-pointer items-start gap-2.5 text-md leading-6">
              <Checkbox
                className="mt-1"
                checked={checked[index] ?? false}
                onCheckedChange={(value) => { setChecked((current) => current.map((entry, position) => (position === index ? value : entry))); }}
              />
              <span className={cn("min-w-0 break-words", checked[index] && "text-muted-foreground line-through decoration-muted-foreground/50")}>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function CheckboxView({ props, bindings, emit }: ViewProps<"Checkbox">) {
  const [value, setValue] = useInputValue(props.checked, bindings?.checked, false);
  return (
    <label className="flex min-w-0 cursor-pointer items-start gap-2.5 text-md leading-6">
      <Checkbox className="mt-1" checked={value} onCheckedChange={(next) => { setValue(next); emit("change"); }} />
      <span className="min-w-0">
        <span className="block break-words">{props.label}</span>
        {props.description ? <span className="block text-sm text-muted-foreground break-words">{props.description}</span> : null}
      </span>
    </label>
  );
}

export function SwitchView({ props, bindings, emit }: ViewProps<"Switch">) {
  const [value, setValue] = useInputValue(props.checked, bindings?.checked, false);
  return (
    <label className="flex min-w-0 cursor-pointer items-start justify-between gap-4 text-md leading-6">
      <span className="min-w-0">
        <span className="block break-words">{props.label}</span>
        {props.description ? <span className="block text-sm text-muted-foreground break-words">{props.description}</span> : null}
      </span>
      <Switch className="mt-1" checked={value} onCheckedChange={(next) => { setValue(next); emit("change"); }} />
    </label>
  );
}

export function SelectView({ props, bindings, emit }: ViewProps<"Select">) {
  const labelId = useId();
  const [value, setValue] = useInputValue<string | null>(props.value, bindings?.value, null);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span id={labelId} className="text-md font-medium break-words">{props.label}</span>
      <Select value={value} onValueChange={(next) => { if (typeof next === "string") { setValue(next); emit("change"); } }}>
        <SelectTrigger aria-labelledby={labelId} className="w-full max-w-sm min-w-0">
          <SelectValue placeholder={props.placeholder ?? "Choose…"} />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option, index) => (
            <SelectItem key={`${option}-${String(index)}`} value={option} className="break-words">{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SliderView({ props, bindings, emit }: ViewProps<"Slider">) {
  const labelId = useId();
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const [value, setValue] = useInputValue(props.value, bindings?.value, min);
  const clamped = Math.min(max, Math.max(min, value));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-md">
        <span id={labelId} className="min-w-0 truncate font-medium">{props.label}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">{formatNumber(clamped)}</span>
      </div>
      <Slider
        aria-labelledby={labelId}
        min={min}
        max={max}
        {...(props.step === undefined ? {} : { step: props.step })}
        value={clamped}
        onValueChange={(next) => {
          const first: unknown = Array.isArray(next) ? next[0] : next;
          setValue(typeof first === "number" ? first : min);
        }}
        onValueCommitted={() => { emit("change"); }}
      />
    </div>
  );
}

export function ButtonView({ props, emit }: ViewProps<"Button">) {
  return (
    <Button variant={props.variant ?? "default"} className="w-fit max-w-full min-w-0" onClick={() => { emit("press"); }}>
      <span className="truncate">{props.label}</span>
    </Button>
  );
}
