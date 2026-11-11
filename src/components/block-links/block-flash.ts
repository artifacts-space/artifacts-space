const FLASH_MS = 1800;

/**
 * Scrolls a block to the middle of the window and lays a fading tint over
 * it for a moment, so the eye finds it. Smooth scrolling and the fade are
 * off for people who ask for reduced motion; the tint then stays still and
 * goes after the same time.
 */
export function revealBlock(element: HTMLElement): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  for (const earlier of document.querySelectorAll("[data-block-flash]")) earlier.remove();
  const box = element.getBoundingClientRect();
  const flash = document.createElement("div");
  flash.className = "block-link-flash";
  flash.setAttribute("aria-hidden", "true");
  flash.dataset.blockFlash = "";
  Object.assign(flash.style, {
    left: `${String(box.left + window.scrollX - 6)}px`,
    top: `${String(box.top + window.scrollY - 4)}px`,
    width: `${String(box.width + 12)}px`,
    height: `${String(box.height + 8)}px`,
  });
  document.body.appendChild(flash);
  window.setTimeout(() => { flash.remove(); }, FLASH_MS);
}
