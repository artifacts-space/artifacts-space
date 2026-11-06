import { sparklineShape } from "@/lib/ui/chart-points";

/** The sparkline is drawn in a 200 × 32 box stretched to the Metric's width. */
const width = 200;
const height = 32;

function pointsText(points: [number, number][]) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

/**
 * A small trend line under a Metric value. Neutral ink, so it never reads as
 * good or bad on its own; the last point is marked. `summary` is the text
 * alternative. Draws nothing with fewer than two numbers.
 */
export function Sparkline({ values, summary }: { values: (number | null)[]; summary: string }) {
  const shape = sparklineShape(values, width, height);
  if (!shape.last) return null;
  const [lastX, lastY] = shape.last;
  return (
    <svg role="img" aria-label={summary} viewBox={`-4 -4 ${String(width + 8)} ${String(height + 8)}`} preserveAspectRatio="none" className="mt-1 h-8 w-full overflow-visible">
      {shape.runs.map((points, index) => {
        const [first] = points;
        // A point between two gaps has no line to join: show it as a dot.
        if (points.length === 1 && first) return <line key={index} x1={first[0]} x2={first[0]} y1={first[1]} y2={first[1]} className="stroke-muted-foreground" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
        return <polyline key={index} points={pointsText(points)} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
      })}
      <line x1={lastX} x2={lastX} y1={lastY} y2={lastY} className="stroke-foreground" strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
