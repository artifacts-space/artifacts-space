/** The three theme choices, in the order the switcher shows them: System first, then both modes. */
export const themeChoices = ["system", "light", "dark"] as const;

export type ThemeChoice = (typeof themeChoices)[number];

const themeChoiceSet: ReadonlySet<string> = new Set(themeChoices);

/** True when a value is one of the theme choices. */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && themeChoiceSet.has(value);
}

/**
 * The selected choice for a stored next-themes value. A missing or unknown
 * stored value means the person never chose, so System is selected.
 */
export function toThemeChoice(stored: string | undefined): ThemeChoice {
  return isThemeChoice(stored) ? stored : "system";
}
