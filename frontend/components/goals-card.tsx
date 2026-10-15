"use client";

import { Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { shortDate } from "@/lib/training";

type Fields = "calories" | "protein" | "carbs" | "fat";
type Goals = Record<Fields, number | null>;
type Change = Goals & { start_day: string; varies: boolean; source: string };
type TargetsView = { today: string; current: Goals | null; history: Change[] };

const FIELDS: { key: Fields; label: string; unit: string; color: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal", color: "var(--series-1)" },
  { key: "protein", label: "Protein", unit: "g", color: "var(--series-3)" },
  { key: "carbs", label: "Carbs", unit: "g", color: "var(--series-4)" },
  { key: "fat", label: "Fat", unit: "g", color: "var(--series-5)" },
];

const field = "w-full rounded-lg border border-hairline bg-page px-3 py-2 text-base outline-none focus:border-accent";

function summary(goals: Goals): string {
  return FIELDS.filter((f) => goals[f.key] !== null)
    .map((f) => (f.key === "calories" ? `${formatNumber(goals.calories!, 0)} kcal` : `${f.label[0]} ${formatNumber(goals[f.key]!, 0)}`))
    .join(" · ");
}

/** MacroFactor's daily goals: imported from its export, updated here when its check-in changes them. */
export function GoalsCard({ i }: { i: number }) {
  const [view, setView] = useState<TargetsView | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<Fields | "start_day", string>>({
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    start_day: "",
  });

  useEffect(() => {
    api<TargetsView>("/api/targets").then(setView);
  }, []);

  function edit() {
    if (!view) return;
    const current = view.current;
    setDraft({
      calories: current?.calories?.toString() ?? "",
      protein: current?.protein?.toString() ?? "",
      carbs: current?.carbs?.toString() ?? "",
      fat: current?.fat?.toString() ?? "",
      start_day: view.today,
    });
    setEditing(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const number = (v: string) => (v.trim() === "" ? null : Number(v));
    setView(
      await api<TargetsView>("/api/targets", {
        method: "PUT",
        body: JSON.stringify({
          start_day: draft.start_day || null,
          calories: number(draft.calories),
          protein: number(draft.protein),
          carbs: number(draft.carbs),
          fat: number(draft.fat),
        }),
      }),
    );
    setEditing(false);
  }

  async function remove(startDay: string) {
    if (!confirm(`Remove the goals you entered for ${shortDate(startDay)}?`)) return;
    setView(await api<TargetsView>(`/api/targets/${startDay}`, { method: "DELETE" }));
  }

  if (!view) return <div className="skeleton h-40 rounded-2xl" />;
  const [latest, ...earlier] = view.history;

  return (
    <section className="rise rounded-2xl border border-hairline bg-surface p-5" style={{ "--i": i } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Nutrition goals</h2>
        {!editing && (
          <button
            onClick={edit}
            className="press flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-sm text-ink-2 hover:border-accent hover:text-ink"
          >
            <Pencil size={13} />
            Update
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-sm text-ink-2">
                {f.label} ({f.unit})
                <input
                  inputMode="decimal"
                  value={draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  className={`${field} mt-1 tabular-nums`}
                />
              </label>
            ))}
          </div>
          <label className="mt-3 block text-sm text-ink-2">
            Starting
            <input
              type="date"
              value={draft.start_day}
              onChange={(e) => setDraft({ ...draft, start_day: e.target.value })}
              className={`${field} mt-1 sm:w-48`}
            />
          </label>
          <div className="mt-4 flex items-center gap-3">
            <button type="submit" className="press rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink">
              Save goals
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </form>
      ) : view.current ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <p className="flex items-center gap-1.5 text-xs text-ink-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: f.color }} />
                  {f.label}
                </p>
                <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums">
                  {view.current![f.key] === null ? "—" : formatNumber(view.current![f.key]!, 0)}
                  <span className="ml-1 text-sm font-normal text-muted">{f.unit}</span>
                </p>
              </div>
            ))}
          </div>
          {latest && (
            <p className="mt-3 text-sm text-muted">
              Since {shortDate(latest.start_day)} · {latest.source === "macrofactor" ? "from MacroFactor" : "entered here"}
              {latest.varies && " · differs by weekday, today's shown"}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">No goals yet.</p>
      )}

      {!editing && earlier.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ink-2 hover:text-ink">Earlier goals</summary>
          <ul className="mt-2 divide-y divide-grid">
            {view.history.map((change) => (
              <li key={change.start_day} className="flex items-center gap-3 py-2 tabular-nums">
                <span className="w-28 shrink-0 text-ink-2">{shortDate(change.start_day)}</span>
                <span className="flex-1">{summary(change)}</span>
                {change.source === "manual" ? (
                  <button
                    onClick={() => remove(change.start_day)}
                    className="press text-muted hover:text-critical"
                    aria-label={`Remove goals from ${shortDate(change.start_day)}`}
                  >
                    <X size={15} />
                  </button>
                ) : (
                  <span className="text-xs text-muted">MacroFactor</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
