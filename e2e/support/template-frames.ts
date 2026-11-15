import type { Locator } from "@playwright/test";

/*
 * What a reader meets in one frame of the template page (/dev/templates):
 * read in the browser in one call each, so a loop over sixty templates at
 * four widths stays quick.
 */

/**
 * What a reader can see and press in a frame, as one string: its visible
 * text, then the names of its buttons that show only an icon. Two readings
 * are equal exactly when the frame looks the same to a reader.
 */
export function signatureOf(frame: Locator): Promise<string> {
  return frame.evaluate((element: HTMLElement) => {
    const shown = (node: Element) => node.checkVisibility({ visibilityProperty: true }) && node.getClientRects().length > 0;
    const named = [...element.querySelectorAll("button[aria-label]")].filter(shown).map((node) => node.getAttribute("aria-label") ?? "");
    return `${element.innerText.replace(/\s+/g, " ").trim()} | ${named.join(", ")}`;
  });
}

/** How many times a frame draws each label: `actions` as the words of a link or button, `pictures` as a named picture. */
export interface LabelCounts {
  actions: Record<string, number>;
  pictures: Record<string, number>;
}

/**
 * Counts, for each label, the places a reader can see it in the frame. A
 * link or button label counts wherever an element's own words are exactly
 * the label (a mockup's link is plain text with no role, so words are all
 * there is to go by), or a button is named by it. A picture counts where an
 * image is named by the label.
 */
export function countLabels(frame: Locator, labels: { actions: readonly string[]; pictures: readonly string[] }): Promise<LabelCounts> {
  return frame.evaluate((element: HTMLElement, { actions, pictures }) => {
    const shown = (node: Element) => node.checkVisibility({ visibilityProperty: true }) && node.getClientRects().length > 0;
    /** The text an element holds itself, without its children's. */
    const ownWords = (node: Element) => [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent ?? "").join("").replace(/\s+/g, " ").trim();
    const tally = (values: readonly string[]) => {
      const counts = new Map<string, number>();
      for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
      return counts;
    };
    const visible = [...element.querySelectorAll("*")].filter(shown);
    const words = tally(visible.map(ownWords).filter((text) => text !== ""));
    const buttonNames = tally(visible.filter((node) => node.tagName === "BUTTON" && node.hasAttribute("aria-label")).map((node) => node.getAttribute("aria-label") ?? ""));
    const pictureNames = tally(visible.filter((node) => node.getAttribute("role") === "img").map((node) => node.getAttribute("aria-label") ?? ""));
    return {
      actions: Object.fromEntries(actions.map((label) => [label, (words.get(label) ?? 0) + (buttonNames.get(label) ?? 0)])),
      pictures: Object.fromEntries(pictures.map((label) => [label, pictureNames.get(label) ?? 0])),
    };
  }, { actions: [...labels.actions], pictures: [...labels.pictures] });
}

/** Makes a frame `width` pixels wide, or gives it its own width back with null, and waits for the page to lay it out. */
export async function setFrameWidth(frame: Locator, width: number | null): Promise<void> {
  await frame.evaluate(async (element: HTMLElement, value) => {
    element.style.width = value === null ? "" : `${String(value)}px`;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, width);
}

/** The button a reader can see in the frame under this name. */
export function shownButton(frame: Locator, label: string): Locator {
  return frame.getByRole("button", { name: label, exact: true }).filter({ visible: true });
}
