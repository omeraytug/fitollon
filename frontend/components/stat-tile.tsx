"use client";

import { useEffect, useRef, useState } from "react";

export type Point = { day: string; value: number };

const HEIGHT = 44;
const PAD = 6; // room for the end dot and its ring

export function formatValue(value: number, unit: string | null): string {
  const digits = Math.abs(value) >= 100 ? 0 : 1;
  const number = value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const suffix = displayUnit(unit);
  return suffix ? `${number} ${suffix}` : number;
}

function displayUnit(unit: string | null): string {
  if (!unit || unit === "count") return "";
  if (unit === "hr") return "h";
  return unit;
}

export function formatDay(day: string, today: string): string {
  if (day === today) return "Today";
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Label, headline value, 7-day average and a 30-day sparkline with a hover readout. */
export function StatTile({
  label,
  unit,
  latest,
  latestDay,
  avg7,
  series,
  today,
}: {
  label: string;
  unit: string | null;
  latest: number;
  latestDay: string;
  avg7: number | null;
  series: Point[];
  today: string;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-surface p-4">
      <h2 className="text-sm text-ink-2">{label}</h2>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{formatValue(latest, unit)}</p>
      <p className="text-xs text-muted">
        {formatDay(latestDay, today)}
        {avg7 !== null && ` · 7-day avg ${formatValue(avg7, unit)}`}
      </p>
      {series.length > 1 && <Sparkline series={series} unit={unit} today={today} label={label} />}
    </section>
  );
}

function Sparkline({ series, unit, today, label }: { series: Point[]; unit: string | null; today: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  // x follows the calendar, so missing days show as longer segments rather than being hidden.
  const times = series.map((p) => Date.parse(`${p.day}T00:00:00Z`));
  const t0 = times[0];
  const span = Math.max(times[times.length - 1] - t0, 1);
  const values = series.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || 1;
  const x = (i: number) => PAD + ((times[i] - t0) / span) * Math.max(width - 2 * PAD, 1);
  const y = (v: number) => PAD + (1 - (v - lo) / range) * (HEIGHT - 2 * PAD);

  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const area = `${line}L${x(series.length - 1).toFixed(1)},${HEIGHT}L${x(0).toFixed(1)},${HEIGHT}Z`;
  const last = series.length - 1;

  function onPointer(event: React.PointerEvent<SVGSVGElement>) {
    const px = event.clientX - event.currentTarget.getBoundingClientRect().left;
    let nearest = 0;
    for (let i = 1; i < series.length; i++) {
      if (Math.abs(x(i) - px) < Math.abs(x(nearest) - px)) nearest = i;
    }
    setHover(nearest);
  }

  const shown = hover ?? last;
  return (
    <div ref={ref} className="relative mt-3">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${label}, last 30 days`}
          onPointerMove={onPointer}
          onPointerLeave={() => setHover(null)}
          className="block touch-none"
        >
          <path d={area} fill="var(--accent-wash)" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={HEIGHT} stroke="var(--grid)" strokeWidth={1} />
          )}
          <circle cx={x(shown)} cy={y(series[shown].value)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        </svg>
      )}
      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-9 rounded-md border border-hairline bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-sm"
          style={{ left: Math.min(Math.max(x(hover) - 50, 0), Math.max(width - 110, 0)) }}
        >
          <span className="font-semibold text-ink">{formatValue(series[hover].value, unit)}</span>{" "}
          <span className="text-ink-2">{formatDay(series[hover].day, today)}</span>
        </div>
      )}
    </div>
  );
}
