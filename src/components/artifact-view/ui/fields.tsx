"use client";

import { useId, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { UiProps } from "@/lib/ui/catalog";
import { cn } from "@/lib/utils";

import { uiIconComponents } from "./icon-glyphs";
import { useInputValue, type ViewProps } from "./stout";

/**
 * Text fields in an interface. They only change the page's own state, and
 * nothing a reader types is ever sent: there is no form element, no field
 * name, and no network action in the catalog. A password field is a drawn
 * stand-in, never an input, so no agent-drawn form can hold a real secret.
 */

/**
 * Attributes every text field carries so browsers and password managers
 * leave it alone: no autofill, and the skip marks the common managers honor.
 * A field has no `name`, which is what a manager keys a saved login on.
 */
export const fieldSkipProps = {
  autoComplete: "off",
  "data-1p-ignore": "",
  "data-lpignore": "true",
  "data-bwignore": "",
  "data-form-type": "other",
} as const;

interface FieldShellProps {
  /** The id of the control the label is for; null when the control is not a real field (the password stand-in), which then takes its name from `labelId`. */
  controlId: string | null;
  /** The id of the label text, for a control that is named by it instead of labelled as a field. */
  labelId?: string | undefined;
  label: string;
  hideLabel: boolean | undefined;
  description: string | undefined;
  error: string | undefined;
  /** Ids for the description and the error, so the control can point at them. */
  notes: { description: string; error: string };
  fullWidth?: boolean | undefined;
  children: ReactNode;
}

/** A field's label, its control, and the description and error under it. */
export function FieldShell({ controlId, labelId, label, hideLabel, description, error, notes, fullWidth, children }: FieldShellProps) {
  const labelClass = cn("text-md font-medium break-words", hideLabel && "sr-only");
  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-1.5", !fullWidth && "max-w-sm")}>
      {/* Without a real field the label is the control's name (aria-labelledby), so it is not also read as a line of its own. */}
      {controlId ? <label htmlFor={controlId} className={labelClass}>{label}</label> : <span id={labelId} aria-hidden className={labelClass}>{label}</span>}
      {children}
      {description ? <p id={notes.description} className="text-sm leading-5 text-muted-foreground break-words">{description}</p> : null}
      {error ? <p id={notes.error} className="text-sm leading-5 text-tone-danger break-words">{error}</p> : null}
    </div>
  );
}

/** The ids of a field's notes, and the attributes that tie the control to the ones that are shown. */
export function useFieldNotes(description: string | undefined, error: string | undefined) {
  const id = useId();
  const notes = { description: `${id}-description`, error: `${id}-error` };
  const describedBy = [description ? notes.description : null, error ? notes.error : null].filter(Boolean).join(" ");
  const control = { ...(describedBy ? { "aria-describedby": describedBy } : {}), ...(error ? { "aria-invalid": true } : {}) };
  return { id, notes, control };
}

/** The icon at the start of a field: decoration, hidden from screen readers, in the placeholder's color. */
function FieldIcon({ name, className }: { name: UiProps<"Input">["icon"]; className?: string }) {
  if (!name) return null;
  const Glyph = uiIconComponents[name];
  return <Glyph aria-hidden data-field-icon="" className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
}

/**
 * The password stand-in: dots in a box drawn like a field. It is an image to
 * assistive technology, not an input: it takes no focus, no typing, and no
 * value, and nothing binds to it. Its name is the field's label, once; what
 * it is, and the field's description and error, are its description. A
 * disabled one is dimmed like the other fields, and its description says it
 * is disabled: an image has no disabled state for `aria-disabled` to set.
 */
function PasswordStandIn({ props }: ViewProps<"Input">) {
  const { id, notes } = useFieldNotes(props.description, props.error);
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const describedBy = [hintId, props.description ? notes.description : null, props.error ? notes.error : null].filter(Boolean).join(" ");
  return (
    <FieldShell controlId={null} labelId={labelId} label={props.label} hideLabel={props.hideLabel} description={props.description} error={props.error} notes={notes} fullWidth={props.fullWidth}>
      <div
        role="img"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        data-password-stand-in=""
        data-disabled={props.disabled ? "" : undefined}
        className={cn("flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-input px-2.5 shadow-xs select-none", props.disabled && "cursor-not-allowed bg-input/50 opacity-50 dark:bg-input/80")}
      >
        <FieldIcon name={props.icon} />
        <span aria-hidden className="truncate text-sm tracking-[0.25em] text-muted-foreground">••••••••</span>
      </div>
      {/* Read only as the image's description, never as text of its own. */}
      <span id={hintId} hidden>{props.disabled ? "A disabled password field in a mockup." : "A password field in a mockup."} It cannot be typed into.</span>
    </FieldShell>
  );
}

function TextInput({ props, bindings, emit }: ViewProps<"Input">) {
  const { id, notes, control } = useFieldNotes(props.description, props.error);
  const [value, setValue] = useInputValue(props.value, bindings?.value, "");
  return (
    <FieldShell controlId={id} label={props.label} hideLabel={props.hideLabel} description={props.description} error={props.error} notes={notes} fullWidth={props.fullWidth}>
      <div className="relative min-w-0">
        <FieldIcon name={props.icon} className={cn("pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2", props.disabled && "opacity-50")} />
        <Input
          {...fieldSkipProps}
          {...control}
          id={id}
          type={props.type ?? "text"}
          value={value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          className={props.icon ? "pl-8" : undefined}
          onChange={(event) => { setValue(event.target.value); emit("change"); }}
        />
      </div>
    </FieldShell>
  );
}

/** A one-line text field, or the password stand-in. The type is checked here too, after expressions resolve. */
export function InputView(view: ViewProps<"Input">) {
  return view.props.type === "password" ? <PasswordStandIn {...view} /> : <TextInput {...view} />;
}

export function TextareaView({ props, bindings, emit }: ViewProps<"Textarea">) {
  const { id, notes, control } = useFieldNotes(props.description, props.error);
  const rows = props.rows ?? 3;
  const [value, setValue] = useInputValue(props.value, bindings?.value, "");
  return (
    <FieldShell controlId={id} label={props.label} hideLabel={props.hideLabel} description={props.description} error={props.error} notes={notes} fullWidth={props.fullWidth}>
      <Textarea
        {...fieldSkipProps}
        {...control}
        id={id}
        // The field grows with what is typed, so `rows` is the least it shows; the shared field sets that height.
        rows={rows}
        value={value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(event) => { setValue(event.target.value); emit("change"); }}
      />
    </FieldShell>
  );
}
