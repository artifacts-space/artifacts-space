import { templatesIn, templateSourcePath } from "@/lib/ui/templates/index";
import { templateCategories, type TemplateCategory, type TemplateKind, type TemplateViewport } from "@/lib/ui/templates/types";

import { docsHref } from "./pages";

/**
 * The section templates as docs: one index page with a row per template and
 * one page per category that draws that category's templates. Titles and
 * links live here, so the pages, the sidebar's reading order, and search
 * agree. Server- and client-safe: no React.
 */

/** The title of each category's page. */
export const templateCategoryTitles: Record<TemplateCategory, string> = {
  navbar: "Navbars",
  banner: "Banners",
  footer: "Footers",
  hero: "Heroes",
  cta: "Calls to action",
  feature: "Feature sections",
  process: "Steps",
  stats: "Numbers",
  logos: "Logo rows",
  pricing: "Pricing sections",
  comparison: "Comparison tables",
  faq: "Questions and answers",
  testimonial: "Testimonials",
  team: "Team sections",
  blog: "Blog sections",
  contact: "Contact sections",
  newsletter: "Newsletter sign-ups",
  auth: "Sign-in screens",
  shell: "App shells",
  dashboard: "Dashboards",
  table: "Table screens",
  detail: "Detail screens",
  settings: "Settings screens",
  empty: "Empty states",
  error: "Error screens",
  modal: "Dialogs",
  command: "Command menus",
  notifications: "Notification lists",
  checkout: "Checkout screens",
};

/** What each kind is called beside a category's title. */
export const templateKindTitles: Record<TemplateKind, string> = { marketing: "Marketing sections", app: "App screens" };

/** The widths a template is drawn for, in words. */
export const templateViewportWords: Record<TemplateViewport, string> = { fluid: "any width", wide: "desktop and tablet", phone: "phone" };

/** The URL of a category's page. */
export function templateCategoryHref(category: TemplateCategory): string {
  return docsHref(`json-render/templates/${category}`);
}

/** The URL of one template: its heading on its category's page. */
export function templateDocsHref(template: { id: string; category: TemplateCategory }): string {
  return docsHref(`json-render/templates/${template.category}`, template.id);
}

/**
 * The repository file to edit for a category's page: the file its first
 * template is written in, read from the index (a batch can span several
 * files). A category with no template yet points at its batch's first file.
 */
export function templateCategorySource(category: TemplateCategory): string {
  const first = templatesIn(category)[0];
  return (first ? templateSourcePath(first.id) : undefined) ?? `src/lib/ui/templates/${templateCategories[category].file}.ts`;
}
