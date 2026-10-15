"use client";

import { ArrowUp, ChevronRight, Flame, Footprints, Play, Scale, Send, Wheat, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CountUp } from "@/components/count-up";
import { SparkBars, Sparkline } from "@/components/sparkline";
import { api } from "@/lib/api";
import { addDays, displayUnit, formatDay, formatNumber, formatValue, longDate, type Point } from "@/lib/format";

type MetricSummary = {
  unit: string | null;
  today: number | null;
  latest: number;
  latest_day: string;
  avg7: number | null;
  series: Point[];
};

type Home = {
  today: string;
  metrics: Record<string, MetricSummary | undefined>;
  last_training: { id: number; day: string; title: string | null } | null;
  next_training: { id: number; name: string } | null;
  last_sync: string | null;
};

const MACROS = [
  { key: "protein", label: "Protein", kcalPerGram: 4, color: "var(--series-3)" },
  { key: "carbs", label: "Carbs", kcalPerGram: 4, color: "var(--series-4)" },
  { key: "fat", label: "Fat", kcalPerGram: 9, color: "var(--series-5)" },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function lastDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i - count + 1));
}

function stagger(i: number) {
  return { "--i": i } as React.CSSProperties;
}

function Big({ value, unit }: { value: number | null | undefined; unit: string | null }) {
  return (
    <p className="mt-2 text-3xl font-semibold tracking-tight">
      {value === null || value === undefined ? (
        <span className="text-muted">—</span>
      ) : (
        <>
          <CountUp value={value} />
          {displayUnit(unit) && <span className="ml-1 text-base font-normal text-muted">{displayUnit(unit)}</span>}
        </>
      )}
    </p>
  );
}

function Card({
  href,
  icon: Icon,
  title,
  i,
  children,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  i: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={stagger(i)}
      className="rise press group flex flex-col rounded-2xl border border-hairline bg-surface p-4 hover:border-accent/40"
    >
      <span className="flex items-center gap-2 text-sm text-ink-2">
        <Icon size={16} className="text-accent" />
        {title}
        <ChevronRight size={16} className="ml-auto text-muted transition-transform group-hover:translate-x-0.5" />
      </span>
      {children}
    </Link>
  );
}

function Hero({ data, onStart }: { data: Home; onStart: (templateId: number) => void }) {
  const [now, setNow] = useState<{ hello: string; synced: string | null } | null>(null);
  useEffect(() => {
    // Clock-dependent text is computed after mount so it matches the viewer's own time zone.
    const update = () => setNow({ hello: greeting(), synced: data.last_sync ? ago(data.last_sync) : null });
    const timer = setTimeout(update, 0);
    const interval = setInterval(update, 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [data.last_sync]);

  return (
    <section
      style={stagger(0)}
      className="rise relative overflow-hidden rounded-3xl border border-hairline bg-linear-to-br from-(--hero-from) to-(--hero-to) p-5 sm:p-7"
    >
      <svg
        viewBox="0 0 400 120"
        aria-hidden
        className="pointer-events-none absolute top-5 right-4 w-[38%] max-w-xs text-accent opacity-25 sm:top-7 sm:right-7"
      >
        <path
          d="M0 78H130L155 44L190 104L222 22L252 88L272 64H400"
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="draw"
        />
      </svg>
      <p className="relative text-sm text-ink-2">{longDate(data.today)}</p>
      <h1 className="relative mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{now?.hello ?? " "}</h1>
      <p className="relative mt-1 h-5 text-sm text-ink-2">
        {now && (now.synced ? `Apple Health synced ${now.synced}` : "No Apple Health sync yet")}
      </p>

      {(data.next_training || data.last_training) && (
        <div className="relative mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-hairline pt-4">
          <div className="flex gap-8">
            {data.next_training && (
              <div>
                <p className="text-xs tracking-wide text-ink-2 uppercase">Next up</p>
                <p className="mt-0.5 text-lg font-semibold">{data.next_training.name}</p>
              </div>
            )}
            {data.last_training && (
              <Link href={`/training/${data.last_training.id}`} className="group">
                <p className="text-xs tracking-wide text-ink-2 uppercase">Last session</p>
                <p className="mt-0.5 text-lg group-hover:text-accent">
                  {data.last_training.title ?? "Session"}{" "}
                  <span className="text-sm text-ink-2">· {formatDay(data.last_training.day, data.today)}</span>
                </p>
              </Link>
            )}
          </div>
          {data.next_training && (
            <button
              onClick={() => onStart(data.next_training!.id)}
              className="press flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-medium text-accent-ink shadow-sm hover:opacity-90"
            >
              <Play size={16} fill="currentColor" />
              Start {data.next_training.name}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function WeightCard({ data, i }: { data: Home; i: number }) {
  const weight = data.metrics.weight;
  const trend = data.metrics.weight_trend;
  if (!weight && !trend) return null;

  let weekly: number | null = null;
  if (trend) {
    const weekAgo = addDays(trend.latest_day, -7);
    const before = [...trend.series].reverse().find((p) => p.day <= weekAgo);
    if (before) weekly = trend.latest - before.value;
  }

  return (
    <Card href="/weight" icon={Scale} title="Weight" i={i}>
      <Big value={weight?.today ?? weight?.latest} unit={weight?.unit ?? "kg"} />
      <p className="text-xs text-muted">
        {weight?.today != null ? "Today's weigh-in" : weight ? `Last weigh-in · ${formatDay(weight.latest_day, data.today)}` : ""}
      </p>
      {trend && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
          Trend {formatValue(trend.latest, trend.unit)}
          {weekly !== null && (
            <span className="inline-flex items-center gap-0.5">
              · <ArrowUp size={13} className={weekly < 0 ? "rotate-180" : ""} aria-label={weekly < 0 ? "down" : "up"} />
              {formatNumber(Math.abs(weekly), 2)} kg this week
            </span>
          )}
        </p>
      )}
      {trend && (
        <div className="mt-auto pt-3">
          <Sparkline series={trend.series} unit={trend.unit} today={data.today} label="Trend weight, last 30 days" />
        </div>
      )}
    </Card>
  );
}

function CaloriesCard({ data, i }: { data: Home; i: number }) {
  const calories = data.metrics.calories;
  const expenditure = data.metrics.expenditure;
  if (!calories) return null;
  const balance = calories.avg7 !== null && expenditure ? calories.avg7 - expenditure.latest : null;

  return (
    <Card href="/nutrition" icon={Flame} title="Calories" i={i}>
      <Big value={calories.today} unit={calories.unit} />
      <p className="text-xs text-muted">{calories.today === null ? "Nothing logged yet today" : "Eaten today"}</p>
      <p className="mt-2 text-sm text-ink-2">
        {calories.avg7 !== null && `7-day avg ${formatValue(calories.avg7, calories.unit)}`}
        {expenditure && ` · burning ~${formatValue(expenditure.latest, expenditure.unit)}`}
      </p>
      {balance !== null && (
        <p className="text-sm text-ink-2">
          {formatValue(Math.abs(balance), "kcal")} a day {balance < 0 ? "under" : "over"} expenditure this week
        </p>
      )}
      <div className="mt-auto pt-3">
        <SparkBars
          series={calories.series}
          days={lastDays(data.today, 14)}
          unit={calories.unit}
          today={data.today}
          label="Calories, last 14 days"
        />
      </div>
    </Card>
  );
}

function MacrosCard({ data, i }: { data: Home; i: number }) {
  const rows = MACROS.map((m) => ({ ...m, metric: data.metrics[m.key] })).filter((m) => m.metric);
  if (rows.length === 0) return null;
  const split = rows.map((m) => ({ ...m, kcal: (m.metric!.today ?? 0) * m.kcalPerGram }));
  const total = split.reduce((sum, m) => sum + m.kcal, 0);

  return (
    <Card href="/nutrition" icon={Wheat} title="Macros" i={i}>
      {total > 0 ? (
        <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-label="Today's calories by macro">
          {split.map((m) => (
            <span
              key={m.key}
              className="sweep rounded-full"
              style={{ flexGrow: m.kcal, backgroundColor: m.color }}
              title={`${m.label} ${Math.round((m.kcal / total) * 100)}% of today's calories`}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 h-2.5 rounded-full bg-grid" />
      )}
      <table className="mt-3 w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted">
            <th className="pb-1 text-left font-normal" />
            <th className="pb-1 text-right font-normal">Today</th>
            <th className="pb-1 text-right font-normal">7-day avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.key}>
              <td className="py-1">
                <span className="mr-2 inline-block size-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                {m.label}
              </td>
              <td className="py-1 text-right font-medium">
                {m.metric!.today === null ? "—" : formatValue(m.metric!.today, m.metric!.unit, 0)}
              </td>
              <td className="py-1 text-right text-ink-2">
                {m.metric!.avg7 === null ? "—" : formatValue(m.metric!.avg7, m.metric!.unit, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function StepsCard({ data, i }: { data: Home; i: number }) {
  const steps = data.metrics.steps;
  if (!steps) return null;
  return (
    <Card href="/steps" icon={Footprints} title="Steps" i={i}>
      <Big value={steps.today} unit={steps.unit} />
      <p className="text-xs text-muted">{steps.today === null ? "No steps synced yet today" : "So far today"}</p>
      {steps.avg7 !== null && <p className="mt-2 text-sm text-ink-2">7-day avg {formatValue(steps.avg7, steps.unit)}</p>}
      <div className="mt-auto pt-3">
        <SparkBars
          series={steps.series}
          days={lastDays(data.today, 14)}
          unit={steps.unit}
          today={data.today}
          label="Steps, last 14 days"
        />
      </div>
    </Card>
  );
}

function AskCoach({ i }: { i: number }) {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <form
      style={stagger(i)}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) router.push(`/chat?q=${encodeURIComponent(text.trim())}`);
      }}
      className="rise flex items-center gap-2 rounded-2xl border border-hairline bg-surface p-2 pl-4 focus-within:border-accent"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask your coach anything…"
        className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        aria-label="Ask"
        className="press grid size-10 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-40"
      >
        <Send size={17} />
      </button>
    </form>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="skeleton h-48 rounded-3xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="skeleton h-44 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<Home | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Home>("/api/home").then(setData, (e: Error) => setError(e.message));
  }, []);

  async function start(templateId: number) {
    const { id } = await api<{ id: number }>("/api/training/sessions", {
      method: "POST",
      body: JSON.stringify({ template_id: templateId, day: null }),
    });
    router.push(`/training/${id}`);
  }

  if (error) return <p className="text-critical">{error}</p>;
  if (!data) return <Skeleton />;

  const hasMetrics = Object.keys(data.metrics).length > 0;
  return (
    <div className="flex flex-col gap-4">
      <Hero data={data} onStart={start} />

      {hasMetrics ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <WeightCard data={data} i={1} />
          <CaloriesCard data={data} i={2} />
          <MacrosCard data={data} i={3} />
          <StepsCard data={data} i={4} />
        </div>
      ) : (
        <p className="rise text-sm text-muted" style={stagger(1)}>
          No health data yet.
        </p>
      )}

      <AskCoach i={5} />
    </div>
  );
}
