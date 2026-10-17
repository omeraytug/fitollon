"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { addDays, daysBetween, type Point } from "@/lib/format";

export const RANGES = [
  { days: 7, label: "7D" },
  { days: 30, label: "30D" },
  { days: 90, label: "90D" },
  { days: 365, label: "1Y" },
  { days: 0, label: "All" },
];

/** A preset (the last N days, 0 = everything) or a custom start..end. */
export type Range = { days: number } | { start: string; end: string };

export type SeriesResponse = {
  today: string;
  /** The days actually covered; for "All", from the first day with data. */
  start: string;
  end: string;
  series: Record<string, { unit: string | null; points: Point[] }>;
  /** Nutrition goals in effect on each day (only for nutrition metrics). */
  targets?: ({ day: string } & Record<"calories" | "protein" | "carbs" | "fat", number | null>)[];
};

function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function isRange(value: unknown): value is Range {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (typeof r.days === "number") return RANGES.some((preset) => preset.days === r.days);
  return typeof r.start === "string" && typeof r.end === "string" && r.start <= r.end;
}

/** The chosen range, remembered per page in this browser. */
export function useRange(page: string, fallback: number) {
  const [range, setRange] = useState<Range>({ days: fallback });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`range:${page}`) ?? "null");
      if (isRange(saved)) {
        const timer = setTimeout(() => setRange(saved), 0);
        return () => clearTimeout(timer);
      }
    } catch {
      // storage unavailable (private mode) or an old format; keep the default
    }
  }, [page]);
  function choose(next: Range) {
    setRange(next);
    try {
      localStorage.setItem(`range:${page}`, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return [range, choose] as const;
}

export function useSeries(keys: string[], range: Range) {
  const [data, setData] = useState<SeriesResponse | null>(null);
  const [error, setError] = useState("");
  const query = `keys=${keys.join(",")}&${"days" in range ? `days=${range.days}` : `start=${range.start}&end=${range.end}`}`;
  useEffect(() => {
    let current = true;
    api<SeriesResponse>(`/api/series?${query}`).then(
      (response) => {
        if (current) {
          setError("");
          setData(response);
        }
      },
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, [query]);
  return { data, error };
}

export function HistoryHeader({
  title,
  range,
  onRange,
}: {
  title: string;
  range: Range;
  onRange: (range: Range) => void;
}) {
  const custom = "start" in range;
  const button = (active: boolean) =>
    `press rounded-full px-3 py-1 text-sm ${active ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`;
  const dateField = "rounded-lg border border-hairline bg-surface px-3 py-1.5 text-base outline-none focus:border-accent sm:text-sm";

  return (
    <div className="rise flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="-ml-1 inline-flex items-center text-sm text-ink-2 hover:text-ink">
            <ChevronLeft size={16} />
            Home
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="flex rounded-full border border-hairline bg-surface p-0.5" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => onRange({ days: r.days })}
              aria-pressed={!custom && range.days === r.days}
              className={button(!custom && range.days === r.days)}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => {
              if (custom) return;
              const today = localToday(); // read on click: the page is prerendered without a clock
              onRange({ start: addDays(today, -29), end: today });
            }}
            aria-pressed={custom}
            className={button(custom)}
          >
            Custom
          </button>
        </div>
      </div>
      {custom && (
        <div className="flex flex-wrap items-center gap-2 self-end text-sm text-ink-2">
          <label className="flex items-center gap-2">
            From
            <input
              type="date"
              value={range.start}
              max={range.end}
              onChange={(e) => e.target.value && onRange({ start: e.target.value, end: range.end })}
              className={dateField}
            />
          </label>
          <label className="flex items-center gap-2">
            to
            <input
              type="date"
              value={range.end}
              min={range.start}
              max={localToday()}
              onChange={(e) => e.target.value && onRange({ start: range.start, end: e.target.value })}
              className={dateField}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export function Stat({ label, value, detail, i }: { label: string; value: string; detail?: string; i: number }) {
  return (
    <div className="rise rounded-2xl border border-hairline bg-surface p-4" style={{ "--i": i } as React.CSSProperties}>
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
    </div>
  );
}

export function ChartCard({ title, i, children }: { title?: string; i: number; children: React.ReactNode }) {
  return (
    <section className="rise rounded-2xl border border-hairline bg-surface p-4 sm:p-5" style={{ "--i": i } as React.CSSProperties}>
      {title && <h2 className="mb-3 font-medium">{title}</h2>}
      {children}
    </section>
  );
}

export function HistorySkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="skeleton h-20 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-72 rounded-2xl" />
    </div>
  );
}

/** Bars average into weeks past ~4 months, where single days get too thin to read. */
export function isWeekly(data: SeriesResponse): boolean {
  return daysBetween(data.start, data.end) > 120;
}

/** Days in the range before today (today's log and steps are still filling up). */
export function fullDays(data: SeriesResponse): number {
  const last = data.end < data.today ? data.end : addDays(data.today, -1);
  return Math.max(daysBetween(data.start, last) + 1, 0);
}
