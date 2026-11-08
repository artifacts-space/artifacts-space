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

/** A closing root tag. Linear: the literal comes first, and `\s*` stops at the next non-space. */
const closingTag = /<\/svg\s*>/gi;
const whitespace = /\s/;

/** For each position, where the first `-->` at or after it starts, or -1. */
function commentEnds(text: string): Int32Array {
  const ends = new Int32Array(text.length + 1).fill(-1);
  for (let index = text.length - 3; index >= 0; index -= 1) {
    ends[index] = text.startsWith("-->", index) ? index : (ends[index + 1] ?? -1);
  }
  return ends;
}

/**
 * For each position in `text`, whether everything from there to the end is
 * whitespace and complete comments (a comment ends at the first `-->`, as in
 * XML). One pass from the end, so it runs in linear time on any input, unlike
 * a regex with a repeated lazy group, which can backtrack exponentially.
 */
function commentOnlyTails(text: string): Uint8Array {
  const ends = commentEnds(text);
  const tails = new Uint8Array(text.length + 1);
  tails[text.length] = 1;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (whitespace.test(text.charAt(index))) {
      tails[index] = tails[index + 1] ?? 0;
    } else if (text.startsWith("<!--", index)) {
      const end = ends[index + 4] ?? -1;
      tails[index] = end >= 0 ? (tails[end + 3] ?? 0) : 0;
    }
  }
  return tails;
}

/** Whether the source ends with a closing `</svg>` followed only by whitespace and comments. */
function closesRoot(svg: string): boolean {
  const tails = commentOnlyTails(svg);
  for (const match of svg.matchAll(closingTag)) {
    if (tails[match.index + match[0].length] === 1) return true;
  }
  return false;
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
  if (!selfClosing && !closesRoot(svg)) {
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
