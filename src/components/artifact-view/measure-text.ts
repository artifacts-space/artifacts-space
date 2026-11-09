"use client";

import { fitWidth } from "@/lib/sheet-column-rules";

let canvas: HTMLCanvasElement | null = null;

/**
 * Room beside a column's name for the header's padding, sort and filter
 * icons, and menu button: ColumnHeader in csv-table.tsx and EditorHeader in
 * csv-grid-editor.tsx. Change it with them; fitWidth's own padding adds
 * some slack on top.
 */
const headerControls = 44;

function firstLine(value: string): string {
  const end = value.search(/[\r\n]/);
  return end === -1 ? value : value.slice(0, end);
}

function context(): CanvasRenderingContext2D | null {
  canvas ??= document.createElement("canvas");
  return canvas.getContext("2d");
}

/** The font of an element, in the form a canvas takes. */
function fontOf(element: Element, weight?: string): string {
  const style = getComputedStyle(element);
  return `${weight ?? style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

/**
 * The width that fits a column's content, as a double-click on its edge
 * does in a spreadsheet: the widest first line among its cells and its
 * name, measured in the grid's own fonts. Returns null when the browser
 * cannot measure text.
 */
export function measureFitWidth(grid: Element, name: string, values: Iterable<string>): number | null {
  const measure = context();
  if (!measure) return null;
  const widths: number[] = [];
  measure.font = fontOf(grid);
  for (const value of values) widths.push(measure.measureText(firstLine(value)).width);
  measure.font = fontOf(grid, "500");
  widths.push(measure.measureText(name).width + headerControls);
  return fitWidth(widths);
}
