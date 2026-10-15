"use client";

import { useEffect, useRef, useState } from "react";

import { formatDay, formatValue, type Point } from "@/lib/format";

const PAD = 6; // room for the end dot and its ring

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function Readout({ point, unit, today, left }: { point: Point; unit: string | null; today: string; left: number }) {
  return (
    <div
      className="pointer-events-none absolute -top-9 rounded-md border border-hairline bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-sm"
      style={{ left }}
    >
      <span className="font-semibold text-ink">{formatValue(point.value, unit)}</span>{" "}
      <span className="text-ink-2">{formatDay(point.day, today)}</span>
    </div>
  );
}

/** Trend line with a soft area, drawn in on mount; hover shows the day's value. */
export function Sparkline({
  series,
  unit,
  today,
  label,
  height = 44,
  color = "var(--series-1)",
}: {
  series: Point[];
  unit: string | null;
  today: string;
  label: string;
  height?: number;
  color?: string;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  if (series.length < 2) return null;

  // x follows the calendar, so missing days show as longer segments rather than being hidden.
  const times = series.map((p) => Date.parse(`${p.day}T00:00:00Z`));
  const t0 = times[0];
  const span = Math.max(times[times.length - 1] - t0, 1);
  const values = series.map((p) => p.value);
  const lo = Math.min(...values);
  const range = Math.max(...values) - lo || 1;
  const x = (i: number) => PAD + ((times[i] - t0) / span) * Math.max(width - 2 * PAD, 1);
  const y = (v: number) => PAD + (1 - (v - lo) / range) * (height - 2 * PAD);

  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const area = `${line}L${x(series.length - 1).toFixed(1)},${height}L${x(0).toFixed(1)},${height}Z`;
  const shown = hover ?? series.length - 1;

  function onPointer(event: React.PointerEvent<SVGSVGElement>) {
    const px = event.clientX - event.currentTarget.getBoundingClientRect().left;
    let nearest = 0;
    for (let i = 1; i < series.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(nearest) - px)) nearest = i;
    setHover(nearest);
  }

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onPointerMove={onPointer}
          onPointerLeave={() => setHover(null)}
          className="block"
        >
          <path d={area} fill={color} opacity={0.1} className="rise" />
          <path
            d={line}
            pathLength={1}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="draw"
          />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} stroke="var(--grid)" />}
          <circle
            key={shown}
            cx={x(shown)}
            cy={y(series[shown].value)}
            r={4}
            fill={color}
            stroke="var(--surface)"
            strokeWidth={2}
            className={hover === null ? "pop" : undefined}
            style={hover === null ? { animationDelay: "900ms" } : undefined}
          />
        </svg>
      )}
      {hover !== null && (
        <Readout
          point={series[hover]}
          unit={unit}
          today={today}
          left={Math.min(Math.max(x(hover) - 50, 0), Math.max(width - 110, 0))}
        />
      )}
    </div>
  );
}

/** One bar per day (missing days leave a gap), growing in on mount; the latest day is highlighted. */
export function SparkBars({
  series,
  days,
  unit,
  today,
  label,
  height = 44,
}: {
  series: Point[];
  days: string[];
  unit: string | null;
  today: string;
  label: string;
  height?: number;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const byDay = new Map(series.map((p) => [p.day, p.value]));
  const max = Math.max(...series.map((p) => p.value), 1);
  const band = width / days.length;
  const gap = band >= 8 ? 2 : 1;
  const barWidth = Math.max(band - gap, 1);
  const radius = Math.min(4, barWidth / 2);

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onPointerMove={(e) => {
            const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
            setHover(Math.min(days.length - 1, Math.max(0, Math.floor(px / band))));
          }}
          onPointerLeave={() => setHover(null)}
          className="block"
        >
          {days.map((day, i) => {
            const value = byDay.get(day);
            if (value === undefined) return null;
            const h = Math.max((value / max) * height, 2);
            const x0 = i * band + gap / 2;
            const top = height - h;
            const r = Math.min(radius, h);
            const d = `M${x0},${height}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barWidth - r}Q${x0 + barWidth},${top} ${x0 + barWidth},${top + r}V${height}Z`;
            const latest = i === days.length - 1 || (hover !== null && hover === i);
            return (
              <path
                key={day}
                d={d}
                fill="var(--series-1)"
                opacity={latest ? 1 : 0.35}
                className="bar-in"
                style={{ animationDelay: `${i * 25}ms` }}
              />
            );
          })}
        </svg>
      )}
      {hover !== null && byDay.has(days[hover]) && (
        <Readout
          point={{ day: days[hover], value: byDay.get(days[hover])! }}
          unit={unit}
          today={today}
          left={Math.min(Math.max(hover * band - 50, 0), Math.max(width - 110, 0))}
        />
      )}
    </div>
  );
}
