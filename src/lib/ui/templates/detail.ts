import { templateFacts } from "./facts";
import { findTemplate, templateKind, templateRow, type TemplateRow } from "./index";
import { instantiateTemplate, templateAsSpec, templatePageKey, type SpecLike } from "./instantiate";
import { TemplateError, type TemplateFragment, type TemplateSlot, type TemplateSurface, type UiTemplate } from "./types";

/** How a template is handed out: as a piece to attach to a spec, or as a complete spec. */
export type TemplateForm = "fragment" | "spec";

/** One template in full, ready to use: its list row, what was counted from it, its slots, and the fragment or the spec. */
export interface TemplateDetail extends TemplateRow {
  /** The surface the template sits on. As a fragment, put it in a Box with this surface unless its root paints it. */
  surface: TemplateSurface;
  /** Deepest nesting inside the template. */
  depth: number;
  /** True when a reader can change something in it (a switch, a field, a button with an action). */
  interactive: boolean;
  /** The components it uses. */
  components: string[];
  /** The prefix its element keys and state paths carry. */
  prefix: string;
  /** What to change: each slot names a prop of an element, or a value in the state. */
  slots: TemplateSlot[];
  /** How to use what was returned. */
  attach: string;
  fragment?: TemplateFragment;
  spec?: SpecLike;
}

function attachNote(form: TemplateForm, root: string, prefix: string, hasState: boolean): string {
  if (form === "spec") {
    return `\`spec\` is a complete ui spec: save it as a ui artifact, or pass it as a frame's \`spec\` to canvas_frame_save. To add another template, fetch it as a fragment and attach it under "${templatePageKey}".`;
  }
  const state = hasState ? `, add \`fragment.state\`'s one key ("${prefix}") to its \`state\`,` : "";
  return `Add \`fragment.elements\` to your spec's \`elements\`${state} and put "${root}" in the \`children\` of a Box, Stack, Grid, Card, or Section. Every key and state path already carries the prefix "${prefix}"; fetch the template again with another \`prefix\` to use it twice.`;
}

function known(id: string): UiTemplate {
  const template = findTemplate(id);
  if (!template) throw new TemplateError(`No template has the id "${id.slice(0, 60)}". Call ui_templates_list for the ids.`);
  return template;
}

/**
 * One template by id, with every key and state path under `prefix` (the id
 * when left out), as a fragment (the default) or a complete spec. Throws a
 * message for the agent when the id is unknown or the prefix is not usable.
 */
export function templateDetail(id: string, options: { prefix?: string | undefined; as?: TemplateForm | undefined } = {}): TemplateDetail {
  const template = known(id);
  const form = options.as ?? "fragment";
  const instance = instantiateTemplate(template, { prefix: options.prefix });
  const facts = templateFacts(template);
  const detail: TemplateDetail = {
    ...templateRow(template),
    kind: templateKind(template),
    surface: template.surface,
    depth: facts.depth,
    interactive: facts.interactive,
    components: facts.components,
    prefix: instance.prefix,
    slots: instance.slots,
    attach: attachNote(form, instance.root, instance.prefix, instance.state !== undefined),
  };
  if (form === "spec") return { ...detail, spec: templateAsSpec(template, { prefix: instance.prefix }) };
  const fragment: TemplateFragment = { root: instance.root, elements: instance.elements };
  if (instance.state) fragment.state = instance.state;
  return { ...detail, fragment };
}
