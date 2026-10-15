"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatTile, formatDay, type Point } from "@/components/stat-tile";
import { api } from "@/lib/api";

type MetricSummary = {
  unit: string | null;
  latest: number;
  latest_day: string;
  avg7: number | null;
  series: Point[];
};

type Dashboard = {
  today: string;
  metrics: Record<string, MetricSummary>;
  last_training: { day: string; title: string | null } | null;
  last_sync: string | null;
};

const LABELS: Record<string, string> = {
  weight_trend: "Trend weight",
  weight: "Scale weight",
  calories: "Calories",
  expenditure: "Expenditure",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
  steps: "Steps",
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dashboard>("/api/dashboard").then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-critical">{error}</p>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const keys = Object.keys(LABELS).filter((key) => data.metrics[key]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Last 30 days</h1>
        <p className="text-sm text-muted">
          {data.last_sync ? `Last Apple Health sync ${new Date(data.last_sync).toLocaleString()}` : "No Apple Health sync yet"}
        </p>
      </div>

      {keys.length === 0 ? (
        <section className="rounded-xl border border-hairline bg-surface p-6">
          <h2 className="font-medium">No data yet</h2>
          <p className="mt-1 text-sm text-ink-2">
            Set up the Health Auto Export sync on your iPhone to bring in steps, Apple Watch metrics, and the
            nutrition and weight MacroFactor writes to Apple Health. Instructions are in{" "}
            <Link href="/settings" className="text-accent underline">
              Settings
            </Link>
            .
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {keys.map((key) => {
            const m = data.metrics[key];
            return (
              <StatTile
                key={key}
                label={LABELS[key]}
                unit={m.unit}
                latest={m.latest}
                latestDay={m.latest_day}
                avg7={m.avg7}
                series={m.series}
                today={data.today}
              />
            );
          })}
        </div>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-4">
        <div>
          <h2 className="text-sm text-ink-2">Last training session</h2>
          <p className="mt-1 font-medium">
            {data.last_training
              ? `${formatDay(data.last_training.day, data.today)}${data.last_training.title ? ` · ${data.last_training.title}` : ""}`
              : "None logged yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/training" className="rounded-md border border-hairline px-3 py-2 text-sm font-medium hover:border-accent">
            Training
          </Link>
          <Link href="/chat" className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink">
            Ask your coach
          </Link>
        </div>
      </section>
    </div>
  );
}
