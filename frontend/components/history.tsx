"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { addDays, daysBetween, type Point } from "@/lib/format";

export const RANGES = [
  { days: 30, label: "30D" },
  { days: 90, label: "90D" },
  { days: 365, label: "1Y" },
  { days: 0, label: "All" },
];

export type SeriesResponse = {
  today: string;
  series: Record<string, { unit: string | null; points: Point[] }>;
  /** The range this response was loaded for; charts key on it so they animate in with new data. */
  days: number;
};

/** The chosen range, remembered per page in this browser. */
export function useRange(page: string, fallback: number) {
  const [days, setDays] = useState(fallback);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(`range:${page}`));
      if (RANGES.some((r) => r.days === saved) && localStorage.getItem(`range:${page}`) !== null) {
        const timer = setTimeout(() => setDays(saved), 0);
        return () => clearTimeout(timer);
      }
    } catch {
      // storage unavailable (private mode); keep the default
    }
  }, [page]);
  function choose(next: number) {
    setDays(next);
    try {
      localStorage.setItem(`range:${page}`, String(next));
    } catch {
      // ignore
    }
  }
  return [days, choose] as const;
}

export function useSeries(keys: string[], days: number) {
  const [data, setData] = useState<SeriesResponse | null>(null);
  const [error, setError] = useState("");
  const query = keys.join(",");
  useEffect(() => {
    let current = true;
    api<Omit<SeriesResponse, "days">>(`/api/series?keys=${query}&days=${days}`).then(
      (response) => current && setData({ ...response, days }),
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, [query, days]);
  return { data, error };
}

export function HistoryHeader({
  title,
  days,
  onRange,
}: {
  title: string;
  days: number;
  onRange: (days: number) => void;
}) {
  return (
    <div className="rise flex flex-wrap items-end justify-between gap-3">
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
            onClick={() => onRange(r.days)}
            aria-pressed={days === r.days}
            className={`press rounded-full px-3 py-1 text-sm ${
              days === r.days ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
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

/** First day shown: the range's start, or the earliest data point for "All". */
export function rangeStart(data: SeriesResponse): string {
  if (data.days) return addDays(data.today, -(data.days - 1));
  const firsts = Object.values(data.series).flatMap((s) => (s.points.length ? [s.points[0].day] : []));
  return firsts.length ? firsts.sort()[0] : data.today;
}

/** Bars average into weeks past ~4 months, where single days get too thin to read. */
export function isWeekly(data: SeriesResponse): boolean {
  return daysBetween(rangeStart(data), data.today) > 120;
}
