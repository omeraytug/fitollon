"use client";

import { Check, LogOut, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { GoalsCard } from "@/components/goals-card";
import { api } from "@/lib/api";

type Profile = { about: string; goals: string; memories: { id: number; content: string }[] };
type SyncEvent = {
  received_at: string;
  source: string;
  status: string;
  summary: { metric_days?: number; workouts?: number; goal_days?: number; file?: string } | null;
  error: string | null;
};

const SOURCES: Record<string, string> = {
  health_auto_export: "Apple Health",
  macrofactor_export: "MacroFactor import",
};

function describe(summary: NonNullable<SyncEvent["summary"]>): string {
  const parts = [`${summary.metric_days ?? 0} metric-days`];
  if (summary.workouts !== undefined) parts.push(`${summary.workouts} workouts`);
  if (summary.goal_days) parts.push(`${summary.goal_days} goal rows`);
  return parts.join(", ");
}

const card = "rise rounded-2xl border border-hairline bg-surface p-5";
const field = "mt-1 w-full rounded-md border border-hairline bg-page px-3 py-2 outline-none focus:border-accent";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    api<Profile>("/api/profile").then(setProfile);
    api<SyncEvent[]>("/api/sync-events").then(setEvents);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    await api("/api/profile", { method: "PUT", body: JSON.stringify({ about: profile.about, goals: profile.goals }) });
    setSaved("Saved");
    setTimeout(() => setSaved(""), 2000);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function deleteMemory(id: number) {
    await api(`/api/memories/${id}`, { method: "DELETE" });
    setProfile((p) => (p ? { ...p, memories: p.memories.filter((m) => m.id !== id) } : p));
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-9 w-40 rounded-lg" />
        <div className="skeleton h-80 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="rise text-3xl font-semibold tracking-tight">Profile</h1>

      <GoalsCard i={1} />

      <form onSubmit={save} className={card} style={{ "--i": 2 } as React.CSSProperties}>
        <h2 className="font-medium">What your coach should know</h2>
        <p className="mt-1 text-sm text-ink-2">Included in every conversation.</p>
        <label className="mt-4 block text-sm font-medium" htmlFor="about">
          About you
        </label>
        <textarea
          id="about"
          rows={4}
          value={profile.about}
          onChange={(e) => setProfile({ ...profile, about: e.target.value })}
          placeholder="Age, height, training experience, schedule, injuries, equipment…"
          className={field}
        />
        <label className="mt-4 block text-sm font-medium" htmlFor="goals">
          Goals
        </label>
        <textarea
          id="goals"
          rows={3}
          value={profile.goals}
          onChange={(e) => setProfile({ ...profile, goals: e.target.value })}
          placeholder="e.g. Cut to 78 kg by March while keeping strength; bench 100 kg"
          className={field}
        />
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className="press rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink">
            Save
          </button>
          {saved && <span className="text-sm text-good">{saved}</span>}
        </div>
      </form>

      <section className={card} style={{ "--i": 3 } as React.CSSProperties}>
        <h2 className="font-medium">Coach memories</h2>
        <p className="mt-1 text-sm text-ink-2">Facts the coach saved from your conversations.</p>
        {profile.memories.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing saved yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-grid">
            {profile.memories.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span>{m.content}</span>
                <button onClick={() => deleteMemory(m.id)} className="text-muted hover:text-critical">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} style={{ "--i": 4 } as React.CSSProperties}>
        <h2 className="font-medium">Recent syncs</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No syncs received yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-grid text-sm">
            {events.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 tabular-nums">
                {e.status === "ok" ? (
                  <Check size={15} className="text-good" aria-label="OK" />
                ) : (
                  <X size={15} className="text-critical" aria-label="Error" />
                )}
                <span className="font-medium">{SOURCES[e.source] ?? e.source}</span>
                <span className="text-ink-2">{e.summary ? describe(e.summary) : e.error}</span>
                <span className="ml-auto text-muted">
                  {new Date(e.received_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button onClick={logout} className="press flex items-center gap-2 self-start text-sm text-muted hover:text-ink">
        <LogOut size={15} />
        Log out
      </button>
    </div>
  );
}
