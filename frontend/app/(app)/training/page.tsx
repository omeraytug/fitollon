"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { shortDate, type Program, type SessionSummary } from "@/lib/training";

const card = "rounded-xl border border-hairline bg-surface p-5";

export default function TrainingPage() {
  const router = useRouter();
  const [program, setProgram] = useState<Program | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [pastDay, setPastDay] = useState("");
  const [pastTemplate, setPastTemplate] = useState("");

  useEffect(() => {
    api<Program>("/api/training/program").then(setProgram);
    api<SessionSummary[]>("/api/training/sessions").then(setSessions);
  }, []);

  async function start(templateId: number | null, day?: string) {
    const { id } = await api<{ id: number }>("/api/training/sessions", {
      method: "POST",
      body: JSON.stringify({ template_id: templateId, day: day || null }),
    });
    router.push(`/training/${id}`);
  }

  if (!program) return <p className="text-muted">Loading…</p>;
  const next = program.templates.find((t) => t.id === program.next_template_id);
  const others = program.templates.filter((t) => t.id !== program.next_template_id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Training</h1>
        <Link href="/training/program" className="text-sm text-accent">
          Edit program
        </Link>
      </div>

      {program.templates.length === 0 ? (
        <section className={card}>
          <h2 className="font-medium">Set up your program</h2>
          <p className="mt-1 text-sm text-ink-2">
            Add the sessions in your cycle (e.g. Upper A, Lower A, Upper B, Lower B) with their exercises, sets, rep
            ranges and RIR targets. Then each session starts from its plan and shows what you did last time.
          </p>
          <Link href="/training/program" className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
            Set up program
          </Link>
        </section>
      ) : (
        <section className={card}>
          {next && (
            <>
              <h2 className="text-sm text-ink-2">Next in your cycle</h2>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xl font-semibold">{next.name}</p>
                <button onClick={() => start(next.id)} className="rounded-md bg-accent px-5 py-2.5 font-medium text-accent-ink">
                  Start {next.name}
                </button>
              </div>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-grid pt-4">
            {others.map((t) => (
              <button
                key={t.id}
                onClick={() => start(t.id)}
                className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-2 hover:border-accent hover:text-ink"
              >
                Start {t.name}
              </button>
            ))}
            <button
              onClick={() => start(null)}
              className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-2 hover:border-accent hover:text-ink"
            >
              Empty session
            </button>
          </div>
        </section>
      )}

      {program.templates.length > 0 && (
        <section className={card}>
          <h2 className="font-medium">Log a past session</h2>
          <p className="mt-1 text-sm text-ink-2">For filling in sessions you already did, e.g. your current block.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="date"
              value={pastDay}
              onChange={(e) => setPastDay(e.target.value)}
              className="rounded-md border border-hairline bg-page px-3 py-2"
            />
            <select
              value={pastTemplate}
              onChange={(e) => setPastTemplate(e.target.value)}
              className="rounded-md border border-hairline bg-page px-3 py-2"
            >
              <option value="">Choose session…</option>
              {program.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              disabled={!pastDay || !pastTemplate}
              onClick={() => start(Number(pastTemplate), pastDay)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
            >
              Log it
            </button>
          </div>
        </section>
      )}

      <section className={card}>
        <h2 className="font-medium">Recent sessions</h2>
        {sessions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing logged yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-grid">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/training/${s.id}`} className="flex items-baseline justify-between gap-3 py-2.5 hover:text-accent">
                  <span>
                    <span className="font-medium">{s.title}</span>
                    <span className="ml-2 text-sm text-muted">{shortDate(s.day)}</span>
                  </span>
                  <span className="shrink-0 text-sm text-ink-2 tabular-nums">{s.set_count} sets</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
