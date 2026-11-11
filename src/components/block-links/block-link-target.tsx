"use client";

import { useEffect } from "react";

import { findAnchoredBlock, parseBlockHash } from "@/lib/block-links/anchor-rules";

import { revealBlock } from "./block-flash";
import { blockRoot, domBlocks } from "./dom-blocks";

/** How long to wait for the blocks to render (the editor loads after the page) before giving up. */
const WAIT_MS = 10_000;

/** The element a link names inside `container`, or null when it is not there (yet). */
function linkedBlock(container: HTMLElement, hash: string): HTMLElement | null {
  const anchor = parseBlockHash(hash);
  const root = blockRoot(container);
  if (!anchor || !root) return null;
  const blocks = domBlocks(root);
  return blocks[findAnchoredBlock(blocks.map((entry) => entry.block), anchor)]?.element ?? null;
}

/**
 * Opens a link to one block (`#block=…`, from "Copy link to block"): finds
 * the block in the element marked `data-block-links`, scrolls to it, and
 * highlights it for a moment. It waits for the blocks to render, watching
 * the page rather than polling, and stops after ten seconds. It runs again
 * when the fragment changes. Browsers that understand text fragments have
 * already scrolled to the words; this lands on the whole block either way.
 */
export function BlockLinkTarget() {
  useEffect(() => {
    let observer: MutationObserver | null = null;
    let timer = 0;
    const stop = () => {
      observer?.disconnect();
      observer = null;
      window.clearTimeout(timer);
    };
    const reveal = () => {
      stop();
      const container = document.querySelector<HTMLElement>("[data-block-links]");
      if (!container || !parseBlockHash(window.location.hash)) return;
      const tryReveal = () => {
        const element = linkedBlock(container, window.location.hash);
        if (!element) return;
        stop();
        revealBlock(element);
      };
      observer = new MutationObserver(tryReveal);
      observer.observe(container, { childList: true, subtree: true });
      timer = window.setTimeout(stop, WAIT_MS);
      tryReveal();
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => {
      stop();
      window.removeEventListener("hashchange", reveal);
    };
  }, []);
  return null;
}
