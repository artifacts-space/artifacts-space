/**
 * Mermaid's look: hairline edges, no shadows or gradients, small arrowheads,
 * airy spacing, and text at the type scale. Colors come in as a palette read
 * from the page's tokens (see mermaid-palette.ts), because the diagram shows
 * as an <img>, where CSS variables cannot reach.
 */

/** Token colors resolved to opaque sRGB hex, which Mermaid's color math can read. */
export interface DiagramPalette {
  /** The frame behind the diagram (--card). Nodes and edge labels use it too. */
  surface: string;
  /** A quiet fill for notes, clusters, and activations (--muted). */
  subtle: string;
  /** Node and box edges (--diagram-stroke). */
  stroke: string;
  /** Connector lines and arrowheads (--diagram-line). */
  line: string;
  /** Primary text (--foreground). */
  text: string;
  /** Edge labels and secondary text (--muted-foreground). */
  muted: string;
  /** Chart series 1 to 8, for pie slices and gantt bars. */
  series: readonly string[];
  /** Text on a series color, such as pie slice labels (--diagram-on-series). */
  onSeries: string;
}

/** Text sizes in px, matching text-sm and text-xs. Nothing goes under 13. */
const fontSize = { body: 14, small: 13 } as const;

function seriesAt(palette: DiagramPalette, index: number): string {
  return palette.series[index % Math.max(palette.series.length, 1)] ?? palette.line;
}

function pieVariables(palette: DiagramPalette): Record<string, string> {
  const slices = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`pie${String(index + 1)}`, seriesAt(palette, index)]));
  return {
    ...slices,
    pieStrokeColor: palette.surface,
    pieStrokeWidth: "2px",
    pieOuterStrokeWidth: "0px",
    pieOuterStrokeColor: palette.surface,
    pieOpacity: "1",
    pieTitleTextSize: `${String(fontSize.body + 1)}px`,
    pieTitleTextColor: palette.text,
    pieSectionTextSize: `${String(fontSize.small)}px`,
    pieSectionTextColor: palette.onSeries,
    pieLegendTextSize: `${String(fontSize.small)}px`,
    pieLegendTextColor: palette.text,
  };
}

function ganttVariables(palette: DiagramPalette): Record<string, string> {
  return {
    sectionBkgColor: palette.subtle,
    altSectionBkgColor: palette.surface,
    sectionBkgColor2: palette.subtle,
    taskBkgColor: palette.subtle,
    taskBorderColor: palette.stroke,
    taskTextColor: palette.text,
    taskTextLightColor: palette.text,
    taskTextDarkColor: palette.text,
    taskTextOutsideColor: palette.text,
    activeTaskBkgColor: palette.surface,
    activeTaskBorderColor: seriesAt(palette, 0),
    doneTaskBkgColor: palette.surface,
    doneTaskBorderColor: palette.stroke,
    critBkgColor: palette.surface,
    critBorderColor: seriesAt(palette, 7),
    gridColor: palette.stroke,
    todayLineColor: seriesAt(palette, 1),
    excludeBkgColor: palette.subtle,
  };
}

/** Mermaid themeVariables for the "base" theme: every color from the palette, shadows and gradients off. */
export function diagramThemeVariables(palette: DiagramPalette, fontFamily: string): Record<string, string | number | boolean> {
  const { surface, subtle, stroke, line, text, muted } = palette;
  return {
    darkMode: false,
    background: surface,
    fontFamily,
    fontSize: `${String(fontSize.body)}px`,
    useGradient: false,
    dropShadow: "none",
    strokeWidth: 1,
    radius: 6,
    primaryColor: surface,
    primaryTextColor: text,
    primaryBorderColor: stroke,
    secondaryColor: subtle,
    secondaryTextColor: text,
    secondaryBorderColor: stroke,
    tertiaryColor: surface,
    tertiaryTextColor: text,
    tertiaryBorderColor: stroke,
    mainBkg: surface,
    nodeBkg: surface,
    nodeBorder: stroke,
    nodeTextColor: text,
    textColor: text,
    titleColor: text,
    lineColor: line,
    defaultLinkColor: line,
    arrowheadColor: line,
    edgeLabelBackground: surface,
    clusterBkg: subtle,
    clusterBorder: stroke,
    noteBkgColor: subtle,
    noteTextColor: text,
    noteBorderColor: stroke,
    actorBkg: surface,
    actorBorder: stroke,
    actorTextColor: text,
    actorLineColor: stroke,
    signalColor: line,
    signalTextColor: text,
    labelBoxBkgColor: surface,
    labelBoxBorderColor: stroke,
    labelTextColor: text,
    loopTextColor: muted,
    activationBkgColor: subtle,
    activationBorderColor: stroke,
    sequenceNumberColor: surface,
    classText: text,
    stateBkg: surface,
    stateLabelColor: text,
    labelBackgroundColor: surface,
    compositeBackground: surface,
    compositeTitleBackground: subtle,
    compositeBorder: stroke,
    altBackground: subtle,
    transitionColor: line,
    transitionLabelColor: muted,
    specialStateColor: text,
    innerEndBackground: text,
    attributeBackgroundColorOdd: surface,
    attributeBackgroundColorEven: subtle,
    rowOdd: surface,
    rowEven: subtle,
    ...ganttVariables(palette),
    ...pieVariables(palette),
  };
}

/**
 * CSS Mermaid scopes to the diagram. It thins every edge to a hairline,
 * removes shadows and filters, gives edge labels an opaque pill in the frame
 * color so a line never runs through the text, and sets label sizes.
 */
export function diagramThemeCss(palette: DiagramPalette): string {
  const { surface, muted, line } = palette;
  return [
    "* { filter: none !important; }",
    ".node rect, .cluster rect, rect.actor, rect.note, .statediagram-state rect, .er.entityBox { rx: 6px; ry: 6px; }",
    ".node rect, .node circle, .node ellipse, .node polygon, .node path, .cluster rect, rect.actor, rect.note, .note, .activation0, .activation1, .activation2, .labelBox, .stateGroup rect, .statediagram-state rect, .er.entityBox, .er.attributeBoxOdd, .er.attributeBoxEven, .classGroup rect, .classGroup line, .divider, .task, .section0, .section1, .section2, .section3 { stroke-width: 1px !important; }",
    ".flowchart-link, .edgePath .path, .messageLine0, .messageLine1, .relation, .transition, .er.relationshipLine, .actor-line, .loopLine { stroke-width: 1px !important; }",
    `.flowchart-link, .edgePath .path, .relation, .transition, .er.relationshipLine { stroke: ${line} !important; }`,
    ".actor-line { stroke-dasharray: 2 4; }",
    "marker path, marker circle { stroke-width: 1px; }",
    // ER "zero" ends are hollow circles; Mermaid fills them white, which glares in dark mode.
    `marker[id*="_er-"] circle { fill: ${surface}; }`,
    `.edgeLabel rect, .edgeLabel .background, .labelBkg, .er.relationshipLabelBox { opacity: 1 !important; fill: ${surface} !important; stroke: ${surface} !important; stroke-width: 8px; stroke-linejoin: round; }`,
    `.edgeLabel, .edgeLabel text, .edgeLabel tspan, .er.relationshipLabel, .transitionLabel, .loopText, .loopText tspan { fill: ${muted} !important; color: ${muted}; font-size: ${String(fontSize.small)}px; }`,
    `.messageText, .noteText, .noteText tspan, .labelText, .labelText tspan { font-size: ${String(fontSize.body)}px; }`,
    `.taskText, .taskTextOutsideRight, .taskTextOutsideLeft, .sectionTitle, .tick text, .grid text { font-size: ${String(fontSize.small)}px; }`,
    `.grid .tick line { stroke-opacity: 0.6; } .grid path { stroke-width: 0; }`,
  ].join("\n");
}

/** Layout settings for an airy diagram, with the same font and type scale in every diagram type. */
export function diagramLayout(fontFamily: string) {
  return {
    flowchart: { padding: 14, nodeSpacing: 40, rankSpacing: 48, diagramPadding: 8, curve: "basis" as const },
    sequence: {
      actorFontFamily: fontFamily,
      actorFontSize: fontSize.body,
      messageFontFamily: fontFamily,
      messageFontSize: fontSize.body,
      noteFontFamily: fontFamily,
      noteFontSize: fontSize.small,
      width: 128,
      height: 40,
      actorMargin: 56,
      boxMargin: 12,
      noteMargin: 12,
      messageMargin: 40,
      mirrorActors: false,
    },
    gantt: { fontSize: fontSize.small, sectionFontSize: fontSize.small, barHeight: 22, barGap: 6, topPadding: 48, leftPadding: 96 },
    class: { padding: 12 },
    state: { padding: 12 },
    er: { fontSize: fontSize.body, diagramPadding: 16, entityPadding: 16 },
    pie: { textPosition: 0.72 },
  };
}
