const svgNamespace = "http://www.w3.org/2000/svg";

/** Comments, XML declarations, and doctypes that may come before the root element. */
const prologue = /^(?:\s|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/i;
const rootTag = /^<svg(?=[\s>/])[^>]*>/i;

/** The result of checking SVG source. */
export interface SvgCheck {
  ok: boolean;
  /** What is wrong, when `ok` is false. */
  error?: string;
}

function stripBom(text: string) {
  return text.startsWith("﻿") ? text.slice(1) : text;
}

/** The root `<svg …>` start tag, or null when the source does not start with one. */
function findRootTag(svg: string): RegExpExecArray | null {
  const body = stripBom(svg).replace(prologue, "");
  return rootTag.exec(body);
}

/**
 * Checks that `svg` is an SVG document: an optional prologue, then an `<svg>`
 * root element that closes. It does not sanitize, because SVG artifacts are
 * only ever shown through an <img>, where scripts and external loads never run.
 */
export function checkSvg(svg: string): SvgCheck {
  const tag = findRootTag(svg);
  if (!tag) return { ok: false, error: "SVG content must start with an <svg> element (an XML declaration or comments before it are fine)." };
  const selfClosing = tag[0].endsWith("/>");
  if (!selfClosing && !/<\/svg\s*>\s*(?:<!--[\s\S]*?-->\s*)*$/i.test(svg)) {
    return { ok: false, error: "The <svg> element never closes. End the content with </svg>." };
  }
  return { ok: true };
}

/** Adds the SVG namespace to the root tag when it is missing. Images without it do not render. */
export function withSvgNamespace(svg: string): string {
  const source = stripBom(svg);
  const tag = findRootTag(source);
  if (!tag || /\sxmlns\s*=/.test(tag[0])) return source;
  const start = source.indexOf(tag[0]);
  return `${source.slice(0, start)}<svg xmlns="${svgNamespace}"${source.slice(start + 4)}`;
}

/**
 * Builds a `data:` URI for showing SVG in an <img>. Browsers run no scripts
 * and load nothing external for images, so this is the only way we show SVG.
 */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withSvgNamespace(svg))}`;
}
