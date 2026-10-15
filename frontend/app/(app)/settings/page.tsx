"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";

type Profile = { about: string; goals: string; memories: { id: number; content: string }[] };
type SyncEvent = {
  received_at: string;
  source: string;
  status: string;
  summary: Record<string, number> | null;
  error: string | null;
};

const card = "rounded-xl border border-hairline bg-surface p-5";
const field = "mt-1 w-full rounded-md border border-hairline bg-page px-3 py-2 outline-none focus:border-accent";

export default function SettingsPage() {
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

  async function deleteMemory(id: number) {
    await api(`/api/memories/${id}`, { method: "DELETE" });
    setProfile((p) => (p ? { ...p, memories: p.memories.filter((m) => m.id !== id) } : p));
  }

  if (!profile) return <p className="text-muted">Loading…</p>;
  const origin = window.location.origin; // only rendered client-side, after the profile has loaded

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <form onSubmit={save} className={card}>
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
          <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
            Save
          </button>
          {saved && <span className="text-sm text-good">{saved}</span>}
        </div>
      </form>

      <section className={card}>
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

      <section className={card}>
        <h2 className="font-medium">Apple Health sync (Health Auto Export)</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>In Health Auto Export, open Automations and add a new <b>REST API</b> automation.</li>
          <li>
            URL: <code className="break-all text-ink">{origin}/api/ingest/health-auto-export</code>
          </li>
          <li>
            Add header <code className="text-ink">Authorization</code> with value{" "}
            <code className="text-ink">Bearer &lt;your INGEST_TOKEN&gt;</code>.
          </li>
          <li>Data: Health Metrics and Workouts. Format: JSON, Export Version 2.</li>
          <li>Turn on Summarize Data and aggregate by day. Date range: Previous 7 Days.</li>
          <li>Run it a few times a day; re-sent days are overwritten, never duplicated.</li>
        </ol>
        <h3 className="mt-5 text-sm font-medium">Recent syncs</h3>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No syncs received yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm tabular-nums">
            <tbody>
              {events.map((e, i) => (
                <tr key={i} className="border-t border-grid">
                  <td className="py-1.5 pr-3">{new Date(e.received_at).toLocaleString()}</td>
                  <td className={`py-1.5 pr-3 whitespace-nowrap ${e.status === "ok" ? "text-good" : "text-critical"}`}>
                    {e.status === "ok" ? "✓ OK" : "✕ Error"}
                  </td>
                  <td className="py-1.5 text-ink-2">
                    {e.summary ? `${e.summary.metric_days} metric-days, ${e.summary.workouts} workouts` : e.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
