"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { normalizeColor } from "@/lib/themes/color";
import type { ContrastChange } from "@/lib/themes/contrast";
import { fontIdsFor, themeFont, type FontRole } from "@/lib/themes/fonts";
import { chartFromText, chartToText, type DraftPalette, type ThemeDraft } from "@/lib/themes/preset-draft";
import { radiusScale, themeColorKeys, themeModes, type ThemeColorKey } from "@/lib/themes/schema";

const colorLabels: Record<ThemeColorKey, string> = {
  background: "Page background",
  foreground: "Text",
  mutedForeground: "Secondary text",
  card: "Card",
  cardEdge: "Card edge",
  accent: "Accent",
  accentForeground: "Text on accent",
};

const modeLabels: Record<string, string> = { auto: "Follow the reader", light: "Always light", dark: "Always dark" };
const fontRoleLabels: Record<FontRole, string> = { body: "Body font", heading: "Heading font", mono: "Code font" };
const radiusLabels: Record<string, string> = { none: "None", sm: "Small", md: "Medium", lg: "Large", xl: "Extra large" };

/** The errors under one field. */
function FieldIssues({ id, messages }: { id: string; messages: readonly string[] | undefined }) {
  if (!messages || messages.length === 0) return null;
  return (
    <ul id={id} className="space-y-0.5 text-xs text-destructive">
      {messages.map((message) => <li key={message}>{message}</li>)}
    </ul>
  );
}

interface FieldsProps {
  draft: ThemeDraft;
  onChange: (next: ThemeDraft) => void;
  issues: ReadonlyMap<string, string[]>;
  suggestions: readonly ContrastChange[];
  /** Resets the chart boxes when the draft changes from outside the form. */
  revision: number;
  disabled: boolean;
}

/** A small square of the color as typed, or an empty frame while it does not parse. */
function ColorChip({ value }: { value: string }) {
  const color = normalizeColor(value);
  return <span aria-hidden className="size-6 shrink-0 rounded-md border" style={color ? { backgroundColor: color } : undefined} />;
}

interface ColorFieldProps {
  mode: "light" | "dark";
  colorKey: ThemeColorKey;
  palette: DraftPalette;
  onPalette: (next: DraftPalette) => void;
  issues: ReadonlyMap<string, string[]>;
  suggestion: ContrastChange | undefined;
  disabled: boolean;
}

function ColorField({ mode, colorKey, palette, onPalette, issues, suggestion, disabled }: ColorFieldProps) {
  const id = `preset-${mode}-${colorKey}`;
  const messages = issues.get(`${mode}.${colorKey}`);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">{colorLabels[colorKey]}</Label>
      <div className="flex items-center gap-2">
        <ColorChip value={palette[colorKey]} />
        <Input
          id={id}
          value={palette[colorKey]}
          disabled={disabled}
          aria-invalid={messages ? true : undefined}
          aria-describedby={messages ? `${id}-issues` : undefined}
          onChange={(event) => { onPalette({ ...palette, [colorKey]: event.target.value }); }}
          className="h-8 font-mono text-sm"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <FieldIssues id={`${id}-issues`} messages={messages} />
      {suggestion ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-contrast-suggestion={suggestion.path}>
          <ColorChip value={suggestion.to} /> Suggested: <span className="font-mono">{suggestion.to}</span>
        </p>
      ) : null}
    </div>
  );
}

function ChartField({ mode, palette, onPalette, issues, revision, disabled }: Omit<ColorFieldProps, "colorKey" | "suggestion"> & { revision: number }) {
  const id = `preset-${mode}-chart`;
  const messages = issues.get(`${mode}.chart`);
  return (
    <div className="space-y-1 sm:col-span-2">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">Chart colors (6 to 8, one per line)</Label>
      <Textarea
        key={revision}
        id={id}
        defaultValue={chartToText(palette.chart)}
        disabled={disabled}
        aria-invalid={messages ? true : undefined}
        onChange={(event) => { onPalette({ ...palette, chart: chartFromText(event.target.value) }); }}
        className="min-h-36 font-mono text-sm leading-5"
        spellCheck={false}
      />
      <FieldIssues id={`${id}-issues`} messages={messages} />
    </div>
  );
}

function PaletteFields({ mode, draft, onChange, issues, suggestions, revision, disabled }: FieldsProps & { mode: "light" | "dark" }) {
  const palette = draft[mode];
  const onPalette = (next: DraftPalette) => { onChange({ ...draft, [mode]: next }); };
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{mode === "light" ? "Light colors" : "Dark colors"}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {themeColorKeys.map((key) => (
          <ColorField key={key} mode={mode} colorKey={key} palette={palette} onPalette={onPalette} issues={issues} suggestion={suggestions.find((change) => change.path === `${mode}.${key}`)} disabled={disabled} />
        ))}
        <ChartField mode={mode} palette={palette} onPalette={onPalette} issues={issues} revision={revision} disabled={disabled} />
      </div>
    </fieldset>
  );
}

interface ChoiceFieldProps {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  messages: readonly string[] | undefined;
  disabled: boolean;
}

function ChoiceField({ id, label, value, options, onChange, messages, disabled }: ChoiceFieldProps) {
  const labels = new Map(options.map((option) => [option.value, option.label]));
  return (
    <div className="flex flex-col gap-1">
      <Label id={`${id}-label`} className="text-xs font-normal text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(next: string | null) => { if (next) onChange(next); }} disabled={disabled}>
        <SelectTrigger id={id} aria-labelledby={`${id}-label`} aria-invalid={messages ? true : undefined} className="h-8 w-full">
          <SelectValue>{(current: string) => labels.get(current) ?? current}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <FieldIssues id={`${id}-issues`} messages={messages} />
    </div>
  );
}

const fontOptions = (role: FontRole) => fontIdsFor(role).map((id) => ({ value: id, label: themeFont(id)?.family ?? id }));

/** Mode, radius, and the three fonts (from the allowlist only). */
function LookFields({ draft, onChange, issues, disabled }: FieldsProps) {
  const roles: FontRole[] = ["heading", "body", "mono"];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ChoiceField id="preset-mode" label="Light or dark" value={draft.mode} options={themeModes.map((mode) => ({ value: mode, label: modeLabels[mode] ?? mode }))} onChange={(mode) => { onChange({ ...draft, mode }); }} messages={issues.get("mode")} disabled={disabled} />
      <ChoiceField id="preset-radius" label="Corner radius" value={draft.radius} options={Object.keys(radiusScale).map((step) => ({ value: step, label: radiusLabels[step] ?? step }))} onChange={(radius) => { onChange({ ...draft, radius }); }} messages={issues.get("radius")} disabled={disabled} />
      {roles.map((role) => (
        <ChoiceField key={role} id={`preset-font-${role}`} label={fontRoleLabels[role]} value={draft.fonts[role]} options={fontOptions(role)} onChange={(font) => { onChange({ ...draft, fonts: { ...draft.fonts, [role]: font } }); }} messages={issues.get(`fonts.${role}`)} disabled={disabled} />
      ))}
    </div>
  );
}

/**
 * The theme JSON fields as a form: look (mode, radius, fonts), then light
 * and dark colors with their chart palettes. Each field shows its own
 * errors, and a color that fails contrast shows the suggested passing color.
 */
export function PresetFormFields(props: FieldsProps) {
  return (
    <div className="space-y-6">
      <LookFields {...props} />
      <PaletteFields {...props} mode="light" />
      <PaletteFields {...props} mode="dark" />
    </div>
  );
}
