"use client";

import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { UiProps } from "@/lib/ui/catalog";
import type { UiIconName } from "@/lib/ui/icon-names";
import { formatNumber } from "@/lib/ui/number-format";
import { cn } from "@/lib/utils";

import { useFieldNotes } from "./fields";
import { uiIconComponents } from "./icon-glyphs";
import { useInputValue, type ViewProps } from "./stout";

/*
 * A Checkbox or Switch here is a span with a role, not a native input, so the
 * <label> around it gives it no name by itself. The control finds that label
 * in the browser, after React takes over; until then, in the server's HTML,
 * it would have no name. So each one points at its words with
 * `aria-labelledby`, which is in the HTML from the start.
 */

export function ChecklistView({ props }: ViewProps<"Checklist">) {
  const labelId = useId();
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
                aria-labelledby={`${labelId}-${String(index)}`}
                checked={checked[index] ?? false}
                onCheckedChange={(value) => { setChecked((current) => current.map((entry, position) => (position === index ? value : entry))); }}
              />
              <span id={`${labelId}-${String(index)}`} className={cn("min-w-0 break-words", checked[index] && "text-muted-foreground line-through decoration-muted-foreground/50")}>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function CheckboxView({ props, bindings, emit }: ViewProps<"Checkbox">) {
  const labelId = useId();
  const [value, setValue] = useInputValue(props.checked, bindings?.checked, false);
  return (
    <label className="flex min-w-0 cursor-pointer items-start gap-2.5 text-md leading-6">
      <Checkbox className="mt-1" aria-labelledby={labelId} checked={value} onCheckedChange={(next) => { setValue(next); emit("change"); }} />
      <span id={labelId} className="min-w-0">
        <span className="block break-words">{props.label}</span>
        {props.description ? <span className="block text-sm text-muted-foreground break-words">{props.description}</span> : null}
      </span>
    </label>
  );
}

export function SwitchView({ props, bindings, emit }: ViewProps<"Switch">) {
  const labelId = useId();
  const [value, setValue] = useInputValue(props.checked, bindings?.checked, false);
  return (
    <label className="flex min-w-0 cursor-pointer items-start justify-between gap-4 text-md leading-6">
      <span id={labelId} className="min-w-0">
        <span className="block break-words">{props.label}</span>
        {props.description ? <span className="block text-sm text-muted-foreground break-words">{props.description}</span> : null}
      </span>
      <Switch aria-labelledby={labelId} checked={value} onCheckedChange={(next) => { setValue(next); emit("change"); }} />
    </label>
  );
}

export function SelectView({ props, bindings, emit }: ViewProps<"Select">) {
  const labelId = useId();
  const { notes, control } = useFieldNotes(props.description, props.error);
  const [value, setValue] = useInputValue<string | null>(props.value, bindings?.value, null);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", props.fullWidth && "w-full")}>
      <span id={labelId} className={cn("text-md font-medium break-words", props.hideLabel && "sr-only")}>{props.label}</span>
      <Select value={value} disabled={props.disabled ?? false} onValueChange={(next) => { if (typeof next === "string") { setValue(next); emit("change"); } }}>
        <SelectTrigger {...control} aria-labelledby={labelId} className={cn("w-full min-w-0", !props.fullWidth && "max-w-sm")}>
          <SelectValue placeholder={props.placeholder ?? "Choose…"} />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option, index) => (
            <SelectItem key={`${option}-${String(index)}`} value={option} className="break-words">{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {props.description ? <p id={notes.description} className="text-sm leading-5 text-muted-foreground break-words">{props.description}</p> : null}
      {props.error ? <p id={notes.error} className="text-sm leading-5 text-tone-danger break-words">{props.error}</p> : null}
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

type ButtonProps = UiProps<"Button">;
type ButtonSize = NonNullable<ButtonProps["size"]>;

/** The shared button's size for each step, with and without a label. The large step is a hero's call to action. */
const buttonSize: Record<ButtonSize, { text: "sm" | "default" | "lg"; icon: "icon-sm" | "icon" | "icon-lg"; extra: string }> = {
  sm: { text: "sm", icon: "icon-sm", extra: "" },
  md: { text: "default", icon: "icon", extra: "" },
  lg: { text: "lg", icon: "icon-lg", extra: "h-10 px-4 text-md" },
};

function ButtonIcon({ name, at }: { name: UiIconName; at: "inline-start" | "inline-end" }) {
  const Glyph = uiIconComponents[name];
  return <Glyph aria-hidden data-icon={at} />;
}

/** The icon on the side it sits on, or nothing. An icon-only button shows it alone. */
function buttonIcon(props: ButtonProps, side: "start" | "end"): ReactNode {
  if (!props.icon) return null;
  const position = props.iconOnly ? "start" : (props.iconPosition ?? "start");
  return position === side ? <ButtonIcon name={props.icon} at={side === "start" ? "inline-start" : "inline-end"} /> : null;
}

/**
 * True only for the value true. State can hold any JSON, and React writes
 * aria-* through as given, so `aria-expanded` and `aria-pressed` are written
 * as true or false whatever the type says.
 */
function isTrue(value: unknown): boolean {
  return value === true;
}

/**
 * A destructive action: the danger tone as the fill and the page color as
 * its label, the same pair as the tone written on the page, which holds
 * 4.5:1 by rule on every surface and in every theme. Hover mixes the fill
 * toward the text color, away from the label, so the label only gains
 * (`dangerHoverMix`, which the theme rule checks over every preset).
 */
const dangerClass = "bg-tone-danger text-background hover:bg-[color-mix(in_oklch,var(--tone-danger),var(--foreground)_14%)] focus-visible:ring-tone-danger/40";

/**
 * A toggle that is on: the text color as the fill and the edge, the page
 * color as its label. The variants a toggle takes (outline, secondary,
 * ghost) are quiet at rest, so pressed turns a hairline or a tint into a
 * solid block, unlike hover (a tint) and the focus ring (outside the edge).
 * The text color reads on every surface at 4.5:1, so the edge holds 3:1
 * there, and the label holds 4.5:1 on the fill. Hover mixes the fill a step
 * toward the label (`pressedHoverMix`, which the theme rule checks over
 * every preset). The dark: classes override the variants' own dark fills.
 * Forced colors (Windows High Contrast) replace the fill with the button
 * face, which would leave pressed looking like rest, so there it takes the
 * system's selected pair (Highlight under HighlightText) on its fill and
 * edge; important, so no hover or dark fill of the variant takes it back.
 */
const pressedForcedColors = "forced-colors:border-forced-selected! forced-colors:bg-forced-selected! forced-colors:text-forced-selected-text!";
const pressedHover = "hover:bg-[color-mix(in_oklch,var(--foreground),var(--background)_12%)]";
const pressedClass = cn(
  "border-foreground bg-foreground text-background hover:text-background",
  pressedHover,
  "dark:border-foreground dark:bg-foreground dark:hover:bg-[color-mix(in_oklch,var(--foreground),var(--background)_12%)]",
  pressedForcedColors,
);

/** The variants a toggle takes: quiet at rest, so pressed is a change from quiet to solid. Validation refuses `pressed` on the others. */
const toggleVariants: ReadonlySet<string> = new Set(["outline", "secondary", "ghost"]);

/** True when the button draws its pressed look: pressed, on a variant a toggle takes. */
const looksPressed = (props: ButtonProps) => isTrue(props.pressed) && toggleVariants.has(props.variant ?? "default");

function buttonClass(props: ButtonProps, size: (typeof buttonSize)[ButtonSize]): string {
  const look = props.variant === "danger" ? dangerClass : looksPressed(props) && pressedClass;
  if (props.iconOnly) return cn("shrink-0", size.extra && "size-10", look);
  return cn("max-w-full min-w-0", props.fullWidth ? "w-full" : "w-fit", size.extra, look);
}

/** The aria-* state a button says it is in: open or closed (`expanded`), and on or off (`pressed`), each written only when set. */
function ariaStates(props: ButtonProps): { "aria-expanded"?: boolean; "aria-pressed"?: boolean } {
  return {
    ...(props.expanded === undefined ? {} : { "aria-expanded": isTrue(props.expanded) }),
    ...(props.pressed === undefined ? {} : { "aria-pressed": isTrue(props.pressed) }),
  };
}

export function ButtonView({ props, emit }: ViewProps<"Button">) {
  const size = buttonSize[props.size ?? "md"];
  const named = props.iconOnly ? { "aria-label": props.label } : {};
  // A disclosure button says whether what it opens is open, and a toggle whether it is on; an ordinary button says nothing.
  const states = ariaStates(props);
  return (
    <Button {...named} {...states} variant={props.variant === "danger" ? "default" : (props.variant ?? "default")} data-variant={props.variant === "danger" ? "danger" : undefined} size={props.iconOnly ? size.icon : size.text} disabled={props.disabled ?? false} className={buttonClass(props, size)} onClick={() => { emit("press"); }}>
      {buttonIcon(props, "start")}
      {props.iconOnly ? null : <span className="truncate">{props.label}</span>}
      {buttonIcon(props, "end")}
    </Button>
  );
}
