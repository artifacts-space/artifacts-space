import type { DocExample } from "../spec-builders";

/** The hand-written part of one component's docs page. Props and descriptions come from the catalog. */
export interface ComponentDoc {
  /** Live examples, each a complete spec. */
  examples: DocExample[];
  /** Rules the props table cannot show, such as cross-field checks. */
  rules?: string[];
}
