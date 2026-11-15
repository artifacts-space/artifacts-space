import { UserFacingError } from "@/lib/user-facing-error";

/**
 * Section templates: ready-made pieces of a website or app screen (a navbar,
 * a hero, a pricing section) built only from the interface components. An
 * agent fetches one, changes its words, and attaches it to a ui spec or uses
 * it as a canvas frame. A template is a fragment of a spec plus a little
 * authored metadata; everything that can be counted is counted from the
 * fragment (facts.ts), never written by hand.
 */

/** The files templates live in, one per batch. */
export const templateFiles = ["nav", "heroes", "features", "pricing", "social", "app"] as const;
export type TemplateFile = (typeof templateFiles)[number];

/** What a template is for: a section of a marketing site, or a screen of an app. */
export type TemplateKind = "marketing" | "app";

const marketing = (file: TemplateFile) => ({ file, kind: "marketing" }) as const;
const appScreen = { file: "app", kind: "app" } as const;

/**
 * Every category, with the file its templates live in and their kind. A
 * template's id starts with its category, so `category` is also how an agent
 * filters the list.
 */
export const templateCategories = {
  navbar: marketing("nav"),
  banner: marketing("nav"),
  footer: marketing("nav"),
  hero: marketing("heroes"),
  cta: marketing("heroes"),
  feature: marketing("features"),
  process: marketing("features"),
  stats: marketing("features"),
  logos: marketing("features"),
  pricing: marketing("pricing"),
  comparison: marketing("pricing"),
  faq: marketing("pricing"),
  testimonial: marketing("social"),
  team: marketing("social"),
  blog: marketing("social"),
  contact: marketing("social"),
  newsletter: marketing("social"),
  auth: appScreen,
  shell: appScreen,
  dashboard: appScreen,
  table: appScreen,
  detail: appScreen,
  settings: appScreen,
  empty: appScreen,
  error: appScreen,
  modal: appScreen,
  command: appScreen,
  notifications: appScreen,
  checkout: appScreen,
} as const satisfies Record<string, { file: TemplateFile; kind: TemplateKind }>;

export type TemplateCategory = keyof typeof templateCategories;

/** Category names, in the order above. */
export const templateCategoryNames = Object.keys(templateCategories) as [TemplateCategory, ...TemplateCategory[]];

/** The two kinds, for filters. */
export const templateKinds = ["marketing", "app"] as const satisfies readonly TemplateKind[];

/**
 * The widths a template is drawn for: `fluid` lays itself out from a phone
 * to a desktop, `wide` needs a desktop or tablet frame, `phone` is a phone
 * screen.
 */
export type TemplateViewport = "fluid" | "wide" | "phone";

/** The surface a template sits on. Its root paints it, or the Box around it must. */
export type TemplateSurface = "page" | "card" | "muted" | "inverse" | "primary";

/** One element of a fragment, as an agent writes it in a ui spec. */
export interface TemplateElement {
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
  visible?: unknown;
  repeat?: unknown;
  on?: unknown;
}

/** A piece of a ui spec: a root key, its elements, and the state they read. It has no `version`. */
export interface TemplateFragment {
  root: string;
  elements: Record<string, TemplateElement>;
  state?: Record<string, unknown>;
}

/**
 * Content an agent is expected to change: a prop of one element, or a value
 * in the template's state (the list a `repeat` draws, a switch's start value).
 * `what` says what it is, in a few words.
 */
export type TemplateSlot =
  | { what: string; element: string; prop: string }
  | { what: string; state: string };

/** One template, as its batch file writes it. */
export interface UiTemplate {
  /** `<category>-<variant>`, such as "pricing-three-tiers". */
  id: string;
  /** What people call it, such as "Pricing, three tiers". */
  name: string;
  category: TemplateCategory;
  /** One plain sentence: what it shows and what it is for. */
  description: string;
  viewport: TemplateViewport;
  surface: TemplateSurface;
  slots: readonly TemplateSlot[];
  fragment: TemplateFragment;
}

/** Limits every template keeps, so six or more fit in one spec. */
export const templateBudget = {
  /** Most elements in one template. */
  maxElements: 60,
  /** Deepest nesting inside one template, counted from its root (the root is 1). */
  maxDepth: 10,
  /** Longest id, and longest prefix an agent may ask for. */
  maxIdLength: 40,
  /** Longest element key inside a template. */
  maxKeyLength: 40,
  maxNameLength: 60,
  maxDescriptionLength: 200,
} as const;

/** Lowercase words joined by hyphens, starting with a letter: the shape of a template id, a prefix, and an element key. */
export const templateNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** A template request that cannot be met. The message is written for the agent that asked. */
export class TemplateError extends UserFacingError {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}
