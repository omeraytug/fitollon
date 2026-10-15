"use client";

import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CompactCycle, CycleTimeline, cycleProgress } from "@/components/cycle";
import { api } from "@/lib/api";
import { shortDate, type Overview } from "@/lib/training";

const card = "rise rounded-2xl border border-hairline bg-surface p-5";
const EARLIER_SHOWN = 4;

function stagger(i: number) {
  return { "--i": i } as React.CSSProperties;
}

export default function TrainingPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pastDay, setPastDay] = useState("");
  const [pastTemplate, setPastTemplate] = useState("");

  useEffect(() => {
    api<Overview>("/api/training/overview").then(setData, (e: Error) => setError(e.message));
  }, []);

  async function start(templateId: number | null, day?: string) {
    const { id } = await api<{ id: number }>("/api/training/sessions", {
      method: "POST",
      body: JSON.stringify({ template_id: templateId, day: day || null }),
    });
    router.push(`/training/${id}`);
  }

  if (error) return <p className="text-critical">{error}</p>;
  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-9 w-40 rounded-lg" />
        <div className="skeleton h-80 rounded-2xl" />
      </div>
    );
  }

  const [current, ...earlier] = data.cycles;
  const hasPlan = data.program !== null && data.templates.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rise flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Training</h1>
        {data.program && (
          <Link
            href="/programs"
            className="press flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-2 hover:text-ink"
          >
            <ClipboardList size={15} className="text-accent" />
            {data.program.name}
            <ChevronRight size={15} className="text-muted" />
          </Link>
        )}
      </div>

      {!hasPlan ? (
        <section className={card} style={stagger(1)}>
          <h2 className="font-medium">Set up your program</h2>
          <p className="mt-1 text-sm text-ink-2">
            Add the sessions of your cycle with their exercises, and this page follows you through each cycle.
          </p>
          <Link
            href="/programs"
            className="press mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink"
          >
            Go to Programs
          </Link>
        </section>
      ) : (
        current && (
          <section className={card} style={stagger(1)}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">This cycle</h2>
              <span className="text-sm text-muted">
                Cycle {current.number}
                {current.first_day ? ` · since ${shortDate(current.first_day)}` : " · not started"}
              </span>
            </div>
            <Progress {...cycleProgress(current)} />
            <div className="mt-5">
              <CycleTimeline cycle={current} onStart={(id) => start(id)} />
            </div>
          </section>
        )
      )}

      {hasPlan && (
        <section className={card} style={stagger(2)}>
          <h2 className="font-medium">Something else today?</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.templates
              .filter((t) => t.id !== data.next_template_id)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => start(t.id)}
                  className="press rounded-full border border-hairline px-3 py-1.5 text-sm text-ink-2 hover:border-accent hover:text-ink"
                >
                  Start {t.name}
                </button>
              ))}
            <button
              onClick={() => start(null)}
              className="press flex items-center gap-1 rounded-full border border-hairline px-3 py-1.5 text-sm text-ink-2 hover:border-accent hover:text-ink"
            >
              <Plus size={14} />
              Session without a plan
            </button>
          </div>
          <h3 className="mt-5 text-sm font-medium">Log a past session</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="date"
              value={pastDay}
              onChange={(e) => setPastDay(e.target.value)}
              className="rounded-lg border border-hairline bg-page px-3 py-2"
            />
            <select
              value={pastTemplate}
              onChange={(e) => setPastTemplate(e.target.value)}
              className="rounded-lg border border-hairline bg-page px-3 py-2"
            >
              <option value="">Choose session…</option>
              {data.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              disabled={!pastDay || !pastTemplate}
              onClick={() => start(Number(pastTemplate), pastDay)}
              className="press rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
            >
              Log it
            </button>
          </div>
        </section>
      )}

      {earlier.length > 0 && (
        <section className={card} style={stagger(3)}>
          <h2 className="font-medium">Earlier cycles</h2>
          <div className="mt-1 divide-y divide-grid">
            {(showAll ? earlier : earlier.slice(0, EARLIER_SHOWN)).map((cycle) => (
              <CompactCycle key={cycle.number} cycle={cycle} />
            ))}
          </div>
          {earlier.length > EARLIER_SHOWN && (
            <button onClick={() => setShowAll(!showAll)} className="mt-2 text-sm text-accent">
              {showAll ? "Show fewer" : `Show all ${earlier.length} cycles`}
            </button>
          )}
        </section>
      )}

      {data.other_sessions.length > 0 && (
        <section className={card} style={stagger(4)}>
          <h2 className="font-medium">Sessions without a plan</h2>
          <ul className="mt-1 divide-y divide-grid">
            {data.other_sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/training/${s.id}`} className="group flex items-center justify-between gap-3 py-2.5 hover:text-accent">
                  <span>
                    <span className="font-medium">{s.title}</span>
                    <span className="ml-2 text-sm text-muted">{shortDate(s.day)}</span>
                  </span>
                  <span className="flex items-center gap-1 text-sm text-ink-2 tabular-nums">
                    {s.set_count} sets
                    <ChevronRight size={16} className="text-muted transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-grid" role="progressbar" aria-valuenow={done} aria-valuemax={total}>
        {done > 0 && <div className="sweep h-full rounded-full bg-accent" style={{ width: `${(done / total) * 100}%` }} />}
      </div>
      <span className="text-sm text-ink-2 tabular-nums">
        {done} of {total} done
      </span>
    </div>
  );
}

