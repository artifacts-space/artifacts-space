import { normalizeProjectName, projectNameKey } from "@/lib/projects/rules";

/** A project the picker can offer. */
export interface PickableProject {
  id: string;
  name: string;
  icon: string | null;
  count: number;
}

/** What the picker shows for what the person typed. */
export interface PickerOptions<T extends PickableProject> {
  /** Projects whose name contains the typed text, exact match first. */
  matches: T[];
  /** The normalized name to create, or null when the text is empty or a project already has that name. */
  create: string | null;
}

/**
 * Filters the picker's projects by the typed text (case-insensitive) and
 * offers to create a new project only when no project has that exact name.
 */
export function pickerOptions<T extends PickableProject>(projects: readonly T[], typed: string): PickerOptions<T> {
  const name = normalizeProjectName(typed);
  const key = projectNameKey(name);
  if (!key) return { matches: [...projects], create: null };
  const matches = projects.filter((item) => projectNameKey(item.name).includes(key));
  const exact = matches.find((item) => projectNameKey(item.name) === key);
  const ordered = exact ? [exact, ...matches.filter((item) => item !== exact)] : matches;
  return { matches: ordered, create: exact ? null : name };
}
