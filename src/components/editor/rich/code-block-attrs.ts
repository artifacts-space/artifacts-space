"use client";

import { useState } from "react";

import { defaultDiagramView, parseFenceInfo, withFenceAttributes, withFenceLanguage, type DiagramView, type FenceInfo } from "@/lib/markdown/fence-info";

import { blockLanguage } from "./code-language-picker";

/** What a code block's view reads from its attributes and the changes it can make. */
export interface CodeBlockAttrs {
  /** The language, or "plain". */
  language: string;
  fence: FenceInfo;
  setLanguage: (language: string | null) => void;
  setView: (view: DiagramView) => void;
  setWrap: (wrap: boolean) => void;
  setCaption: (caption: string) => void;
  /** True while the caption shows: the block has one, or Caption was just pressed. */
  captionShown: boolean;
  /** True when the caption field should take focus: Caption was just pressed. */
  captionFocus: boolean;
  openCaption: () => void;
  closeCaption: () => void;
}

/**
 * Reads a code block's `language` attribute, which holds the fence's whole
 * info string (fence-info.ts), and edits it in place: a new language keeps
 * the attributes, and a new view, wrap, or caption keeps the language and
 * any attribute this version does not know. Read defensively: any value that
 * is not a string reads as no language.
 */
export function useCodeBlockAttrs(attr: unknown, update: (attrs: Record<string, unknown>) => void): CodeBlockAttrs {
  const info = typeof attr === "string" ? attr : "";
  const fence = parseFenceInfo(info);
  const [captionOpen, setCaptionOpen] = useState(false);
  const write = (next: string) => { update({ language: next || null }); };
  return {
    language: blockLanguage(info),
    fence,
    setLanguage: (language) => { write(withFenceLanguage(info, language)); },
    // Preview is the default, so choosing it removes the attribute and keeps the fence plain.
    setView: (view) => { write(withFenceAttributes(info, { view: view === defaultDiagramView ? null : view })); },
    setWrap: (wrap) => { write(withFenceAttributes(info, { wrap })); },
    setCaption: (caption) => { write(withFenceAttributes(info, { caption })); },
    captionShown: fence.caption !== null || captionOpen,
    captionFocus: captionOpen && fence.caption === null,
    openCaption: () => { setCaptionOpen(true); },
    closeCaption: () => { setCaptionOpen(false); },
  };
}
