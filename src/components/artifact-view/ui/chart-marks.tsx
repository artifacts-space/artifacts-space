import { scalePosition, type ChartScale } from "@/lib/ui/chart-scale";

/** Series color classes in fixed order. Tailwind needs the full class names written out. */
export const seriesFill = ["fill-series-1", "fill-series-2", "fill-series-3", "fill-series-4", "fill-series-5", "fill-series-6"] as const;
export const seriesStroke = ["stroke-series-1", "stroke-series-2", "stroke-series-3", "stroke-series-4", "stroke-series-5", "stroke-series-6"] as const;
export const seriesBg = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4", "bg-series-5", "bg-series-6"] as const;

/** The plot is drawn in a 1000 × 1000 box stretched to fit; text stays outside the SVG. */
export const plotSize = 1000;

export interface Series {
  name: string;
  values: (number | null)[];
}

/** Y in plot units for a value (0 is the top). */
export function plotY(value: number, scale: ChartScale): number {
  return plotSize - scalePosition(value, scale) * plotSize;
}

/** X in plot units for the center of label `index` of `count`. */
export function plotX(index: number, count: number): number {
  return ((index + 0.5) / Math.max(count, 1)) * plotSize;
}

export function Bars({ series, count, scale }: { series: Series[]; count: number; scale: ChartScale }) {
  const slot = plotSize / Math.max(count, 1);
  const groupWidth = slot * 0.72;
  const barWidth = groupWidth / series.length;
  const zero = plotY(0, scale);
  return series.map((item, seriesIndex) => (
    <g key={item.name + String(seriesIndex)} className={seriesFill[seriesIndex % seriesFill.length]}>
      {item.values.map((value, index) => {
        if (value === null) return null;
        const y = plotY(value, scale);
        const x = index * slot + (slot - groupWidth) / 2 + seriesIndex * barWidth;
        return <rect key={index} x={x + barWidth * 0.06} width={Math.max(barWidth * 0.88, 0.5)} y={Math.min(y, zero)} height={Math.max(Math.abs(zero - y), 1)} />;
      })}
    </g>
  ));
}

/** Splits a series into runs of consecutive non-null points, so gaps stay gaps. */
function runs(values: (number | null)[], count: number, scale: ChartScale): [number, number][][] {
  const result: [number, number][][] = [];
  let current: [number, number][] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) result.push(current);
      current = [];
      return;
    }
    current.push([plotX(index, count), plotY(value, scale)]);
  });
  if (current.length > 0) result.push(current);
  return result;
}

function pointsText(points: [number, number][]) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

export function Lines({ series, count, scale, area }: { series: Series[]; count: number; scale: ChartScale; area: boolean }) {
  const zero = plotY(0, scale).toFixed(2);
  return series.map((item, seriesIndex) => {
    const color = seriesIndex % seriesFill.length;
    return (
      <g key={item.name + String(seriesIndex)}>
        {runs(item.values, count, scale).map((points, runIndex) => {
          const first = points[0];
          const last = points.at(-1);
          const single = points.length === 1 && first;
          return (
            <g key={runIndex}>
              {area && first && last ? (
                <polygon className={seriesFill[color]} fillOpacity={0.14} points={`${first[0].toFixed(2)},${zero} ${pointsText(points)} ${last[0].toFixed(2)},${zero}`} />
              ) : null}
              {single ? (
                <line className={seriesStroke[color]} x1={single[0] - 6} x2={single[0] + 6} y1={single[1]} y2={single[1]} strokeWidth={6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ) : (
                <polyline className={seriesStroke[color]} points={pointsText(points)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              )}
            </g>
          );
        })}
      </g>
    );
  });
}
