"use client";

import { useEffect, useRef, useState } from "react";

import { addDays, daysBetween, formatNumber, mean, shortDay, type Point } from "@/lib/format";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  kind: "line" | "dots" | "bars";
  points: Point[];
};

type Bucket = { day: string; values: Record<string, number | undefined> };

const MARGIN = { top: 10, right: 8, bottom: 24 };

/** Monday of the day's week. */
function weekStart(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

function buckets(series: ChartSeries[], start: string, end: string, weekly: boolean): Bucket[] {
  const first = weekly ? weekStart(start) : start;
  const step = weekly ? 7 : 1;
  const result: Bucket[] = [];
  for (let day = first; day <= end; day = addDays(day, step)) result.push({ day, values: {} });
  for (const s of series) {
    const groups = new Map<number, number[]>();
    for (const p of s.points) {
      if (p.day < start || p.day > end) continue;
      const index = Math.floor(daysBetween(first, p.day) / step);
      groups.set(index, [...(groups.get(index) ?? []), p.value]);
    }
    for (const [index, values] of groups) if (result[index]) result[index].values[s.key] = mean(values)!;
  }
  return result;
}

function niceStep(raw: number): number {
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

function yScale(values: number[], zeroBased: boolean) {
  let lo = zeroBased ? 0 : Math.min(...values);
  let hi = Math.max(...values);
  if (!zeroBased) {
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep((hi - lo) / 4 || 1);
  lo = zeroBased ? 0 : Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toFixed(6)));
  return { lo, hi, ticks, step };
}

function barPath(x: number, width: number, top: number, bottom: number): string {
  const r = Math.min(4, width / 2, bottom - top);
  return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${bottom}Z`;
}

function Swatch({ s }: { s: Pick<ChartSeries, "kind" | "color"> }) {
  if (s.kind === "line") return <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ backgroundColor: s.color }} />;
  if (s.kind === "dots") return <span className="inline-block size-2 rounded-full" style={{ backgroundColor: s.color }} />;
  return <span className="inline-block size-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} />;
}

export function Legend({ series }: { series: Pick<ChartSeries, "key" | "label" | "kind" | "color">[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <Swatch s={s} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Calendar-based chart with one shared y-axis: bars, lines and dots. Long ranges average into weeks.
 * Hover (or touch-drag) shows every series for that day; a table view lists the same numbers.
 */
export function TimeChart({
  series,
  start,
  end,
  unit,
  label,
  height = 220,
  zeroBased = false,
  weekly = false,
  digits,
  partialDay,
}: {
  series: ChartSeries[];
  start: string;
  end: string;
  unit: string;
  label: string;
  height?: number;
  zeroBased?: boolean;
  weekly?: boolean;
  digits?: number;
  /** A day whose bar is still filling up (today's food log), drawn lighter. */
  partialDay?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const data = buckets(series, start, end, weekly);
  const values = data.flatMap((b) => Object.values(b.values).filter((v): v is number => v !== undefined));
  const fmt = (v: number) => formatNumber(v, digits);
  if (values.length === 0) return <p className="py-10 text-center text-sm text-muted">No data in this range.</p>;

  const y = yScale(values, zeroBased);
  const left = Math.max(...y.ticks.map((t) => fmt(t).length)) * 6.5 + 10;
  const plotW = Math.max(width - left - MARGIN.right, 1);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const band = plotW / data.length;
  const cx = (i: number) => left + (i + 0.5) * band;
  const cy = (v: number) => MARGIN.top + (1 - (v - y.lo) / (y.hi - y.lo)) * plotH;
  const baseline = cy(Math.max(y.lo, 0));

  const tickCount = Math.max(2, Math.min(7, Math.floor(plotW / 84)));
  const xTicks = [...new Set(Array.from({ length: tickCount }, (_, k) => Math.round((k * (data.length - 1)) / (tickCount - 1))))];
  const longSpan = daysBetween(data[0].day, data[data.length - 1].day) > 300;
  const xLabel = (day: string) =>
    longSpan
      ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
      : shortDay(day);
  const bucketLabel = (day: string) =>
    weekly
      ? `Week of ${shortDay(day, true)}`
      : new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: longSpan ? "numeric" : undefined,
          timeZone: "UTC",
        });

  const gap = band >= 6 ? 2 : band >= 3 ? 1 : 0;
  const stagger = (i: number) => `${Math.min(i * 12, 500)}ms`;
  const hovered = hover !== null ? data[hover] : null;

  function pick(event: React.PointerEvent<SVGSVGElement>) {
    const px = event.clientX - event.currentTarget.getBoundingClientRect().left;
    setHover(Math.min(data.length - 1, Math.max(0, Math.floor((px - left) / band))));
  }

  return (
    <div>
      {series.length > 1 && <Legend series={series} />}
      <div ref={ref} className="relative mt-3">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={label}
            className="block touch-pan-y select-none"
            onPointerDown={pick}
            onPointerMove={pick}
            onPointerLeave={() => setHover(null)}
          >
            {y.ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={width - MARGIN.right} y1={cy(t)} y2={cy(t)} stroke="var(--grid)" />
                <text x={left - 8} y={cy(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                  {fmt(t)}
                </text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text
                key={i}
                x={cx(i)}
                y={height - 6}
                textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                className="fill-muted text-[11px]"
              >
                {xLabel(data[i].day)}
              </text>
            ))}

            {hovered && <line x1={cx(hover!)} x2={cx(hover!)} y1={MARGIN.top} y2={baseline} stroke="var(--ink-2)" strokeOpacity={0.35} />}

            {series.map((s) => {
              if (s.kind === "bars") {
                const w = Math.max(band - gap, 0.5);
                return (
                  <g key={s.key}>
                    {data.map((b, i) => {
                      const v = b.values[s.key];
                      if (v === undefined) return null;
                      const partial = !weekly && b.day === partialDay;
                      return (
                        <path
                          key={b.day}
                          d={barPath(left + i * band + gap / 2, w, Math.min(cy(v), baseline - 1), baseline)}
                          fill={s.color}
                          opacity={partial ? 0.4 : hover === null || hover === i ? 1 : 0.55}
                          className="bar-in"
                          style={{ animationDelay: stagger(i) }}
                        />
                      );
                    })}
                  </g>
                );
              }
              if (s.kind === "dots") {
                const r = Math.max(2.5, Math.min(4, band * 0.45));
                return (
                  <g key={s.key}>
                    {data.map((b, i) => {
                      const v = b.values[s.key];
                      if (v === undefined) return null;
                      return (
                        <circle
                          key={b.day}
                          cx={cx(i)}
                          cy={cy(v)}
                          r={hover === i ? r + 1.5 : r}
                          fill={s.color}
                          className="pop"
                          style={{ animationDelay: stagger(i) }}
                        />
                      );
                    })}
                  </g>
                );
              }
              const points = data.flatMap((b, i) => (b.values[s.key] === undefined ? [] : [[cx(i), cy(b.values[s.key]!)]]));
              const d = points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
              const hv = hovered?.values[s.key];
              return (
                <g key={s.key}>
                  <path
                    d={d}
                    pathLength={1}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="draw"
                  />
                  {hv !== undefined && (
                    <circle cx={cx(hover!)} cy={cy(hv)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {hovered && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-md"
            style={cx(hover!) > width * 0.55 ? { right: width - cx(hover!) + 12 } : { left: cx(hover!) + 12 }}
          >
            <p className="font-medium text-ink">{bucketLabel(hovered.day)}</p>
            {series.map((s) => (
              <p key={s.key} className="mt-1 flex items-center gap-2 whitespace-nowrap text-ink-2">
                <Swatch s={s} />
                {s.label}
                <span className="ml-auto pl-3 font-semibold text-ink tabular-nums">
                  {hovered.values[s.key] === undefined ? "—" : `${fmt(hovered.values[s.key]!)} ${unit}`}
                </span>
              </p>
            ))}
            {!weekly && hovered.day === partialDay && <p className="mt-1 text-muted">Still logging today</p>}
          </div>
        )}
      </div>

      <button onClick={() => setTable(!table)} className="mt-2 text-xs text-muted hover:text-ink">
        {table ? "Hide table" : "Show table"}
      </button>
      {table && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-hairline">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr>
                <th className="px-3 py-1.5 text-left font-normal">{weekly ? "Week of" : "Day"}</th>
                {series.map((s) => (
                  <th key={s.key} className="px-3 py-1.5 text-right font-normal">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((b) =>
                series.some((s) => b.values[s.key] !== undefined) ? (
                  <tr key={b.day} className="border-t border-grid">
                    <td className="px-3 py-1.5">{shortDay(b.day, longSpan)}</td>
                    {series.map((s) => (
                      <td key={s.key} className="px-3 py-1.5 text-right">
                        {b.values[s.key] === undefined ? "—" : fmt(b.values[s.key]!)}
                      </td>
                    ))}
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
