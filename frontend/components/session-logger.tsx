"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ExercisePicker } from "@/components/exercise-picker";
import { api } from "@/lib/api";
import {
  buildSlots,
  formatSet,
  shortDate,
  target,
  type Exercise,
  type LastTime,
  type LoggedSet,
  type SessionDetail,
  type Slot,
} from "@/lib/training";

type Picking = { mode: "swap"; slotKey: string } | { mode: "add" } | null;

export function SessionLogger() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [exercises, setExercises] = useState<Record<number, Exercise>>({});
  const [lastTime, setLastTime] = useState<Record<number, LastTime | null>>({});
  const [swaps, setSwaps] = useState<Record<string, number>>({});
  const [extras, setExtras] = useState<number[]>([]);
  const [picking, setPicking] = useState<Picking>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<SessionDetail>(`/api/training/sessions/${id}`).then((detail) => {
      setData(detail);
      setExercises(Object.fromEntries(Object.values(detail.exercises).map((e) => [e.id, e])));
      setLastTime(Object.fromEntries(Object.entries(detail.last_time).map(([k, v]) => [Number(k), v])));
    }, (e: Error) => setError(e.message));
  }, [id]);

  async function loadExercise(exercise: Exercise) {
    setExercises((current) => ({ ...current, [exercise.id]: exercise }));
    if (!(exercise.id in lastTime)) {
      const last = await api<LastTime | null>(`/api/training/exercises/${exercise.id}/last?exclude_session_id=${id}`);
      setLastTime((current) => ({ ...current, [exercise.id]: last }));
    }
  }

  async function patchSession(body: Partial<Pick<SessionDetail, "day" | "notes" | "title">>) {
    await api(`/api/training/sessions/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    setData((d) => (d ? { ...d, ...body } : d));
  }

  async function deleteSession() {
    if (!confirm("Delete this whole session?")) return;
    await api(`/api/training/sessions/${id}`, { method: "DELETE" });
    router.push("/training");
  }

  if (error) return <p className="text-critical">{error}</p>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const slots = buildSlots(data, swaps, extras);
  const setSets = (update: (sets: LoggedSet[]) => LoggedSet[]) => setData((d) => (d ? { ...d, sets: update(d.sets) } : d));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/training" className="text-sm text-muted hover:text-ink">
            ← Training
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{data.title || "Session"}</h1>
        </div>
        <input
          type="date"
          value={data.day}
          onChange={(e) => e.target.value && patchSession({ day: e.target.value })}
          className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          aria-label="Session date"
        />
      </div>

      {slots.map((slot) => (
        <ExerciseCard
          key={slot.key}
          sessionId={data.id}
          slot={slot}
          exercise={exercises[slot.exerciseId]}
          plannedName={slot.planned && slot.planned.exercise_id !== slot.exerciseId ? slot.planned.name : null}
          // This slot's history when it matches what's being done now, else this exercise's own history.
          last={
            slot.slotLast && slot.slotLast.exercise_id === slot.exerciseId
              ? slot.slotLast
              : (lastTime[slot.exerciseId] ?? slot.slotLast)
          }
          templateName={data.template?.name ?? null}
          picking={picking?.mode === "swap" && picking.slotKey === slot.key}
          onStartSwap={() => setPicking({ mode: "swap", slotKey: slot.key })}
          onCancelSwap={() => setPicking(null)}
          onSwap={async (exercise) => {
            await loadExercise(exercise);
            setSwaps((s) => ({ ...s, [slot.key]: exercise.id }));
            setPicking(null);
          }}
          onAdded={(s) => setSets((sets) => [...sets, s])}
          onUpdated={(s) => setSets((sets) => sets.map((x) => (x.id === s.id ? s : x)))}
          onDeleted={(setId) => setSets((sets) => sets.filter((x) => x.id !== setId))}
        />
      ))}

      {picking?.mode === "add" ? (
        <ExercisePicker
          onCancel={() => setPicking(null)}
          onPick={async (exercise) => {
            await loadExercise(exercise);
            setExtras((x) => (x.includes(exercise.id) ? x : [...x, exercise.id]));
            setPicking(null);
          }}
        />
      ) : (
        <button
          onClick={() => setPicking({ mode: "add" })}
          className="rounded-xl border border-dashed border-hairline py-3 text-sm text-ink-2 hover:border-accent hover:text-ink"
        >
          + Add exercise
        </button>
      )}

      <section className="rounded-xl border border-hairline bg-surface p-4">
        <label htmlFor="session-notes" className="text-sm font-medium">
          Session notes
        </label>
        <textarea
          id="session-notes"
          rows={2}
          defaultValue={data.notes ?? ""}
          onBlur={(e) => e.target.value !== (data.notes ?? "") && patchSession({ notes: e.target.value })}
          placeholder="How it felt, groin, sleep, anything worth remembering…"
          className="mt-1 w-full rounded-md border border-hairline bg-page px-3 py-2 outline-none focus:border-accent"
        />
      </section>

      <div className="flex items-center justify-between pb-6">
        <button onClick={deleteSession} className="text-sm text-muted hover:text-critical">
          Delete session
        </button>
        <Link href="/training" className="rounded-md bg-accent px-5 py-2.5 font-medium text-accent-ink">
          Done
        </Link>
      </div>
    </div>
  );
}

function ExerciseCard({
  sessionId,
  slot,
  exercise,
  plannedName,
  last,
  templateName,
  picking,
  onStartSwap,
  onCancelSwap,
  onSwap,
  onAdded,
  onUpdated,
  onDeleted,
}: {
  sessionId: number;
  slot: Slot;
  exercise: Exercise | undefined;
  plannedName: string | null;
  last: LastTime | null;
  templateName: string | null;
  picking: boolean;
  onStartSwap: () => void;
  onCancelSwap: () => void;
  onSwap: (exercise: Exercise) => void;
  onAdded: (s: LoggedSet) => void;
  onUpdated: (s: LoggedSet) => void;
  onDeleted: (setId: number) => void;
}) {
  const loadType = exercise?.load_type ?? "total";
  const ownSets = slot.sets.filter((s) => s.exercise_id === slot.exerciseId);
  // Suggest the matching set from last time, or repeat this session's previous set. Numbers from a different
  // exercise, or from this exercise on another program day (e.g. another machine), are shown but not suggested.
  const differentExercise = last !== null && last.exercise_id !== slot.exerciseId;
  const otherDay = last?.template_name && templateName && last.template_name !== templateName ? last.template_name : null;
  const reference = last && !differentExercise && (!slot.planned || !otherDay) ? last : null;
  const suggestion = reference?.sets[ownSets.length] ?? ownSets.at(-1) ?? reference?.sets.at(-1);
  const [editing, setEditing] = useState<LoggedSet | null>(null);
  const [form, setForm] = useState({ weight: "", reps: "", rir: "", notes: "" });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const shown = editing || touched
    ? form
    : { weight: suggestion?.weight_kg?.toString() ?? "", reps: suggestion?.reps?.toString() ?? "", rir: "", notes: "" };

  function update(field: keyof typeof form, value: string) {
    setForm({ ...shown, [field]: value });
    setTouched(true);
  }

  function startEdit(s: LoggedSet) {
    setEditing(s);
    setForm({
      weight: s.weight_kg?.toString() ?? "",
      reps: s.reps?.toString() ?? "",
      rir: s.rir?.toString() ?? "",
      notes: s.notes ?? "",
    });
  }

  function reset() {
    setEditing(null);
    setTouched(false);
    setForm({ weight: "", reps: "", rir: "", notes: "" });
  }

  async function save() {
    const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
    const values = { weight_kg: num(shown.weight), reps: num(shown.reps), rir: num(shown.rir), notes: shown.notes.trim() || null };
    setBusy(true);
    try {
      if (editing) {
        onUpdated(await api<LoggedSet>(`/api/training/sets/${editing.id}`, { method: "PATCH", body: JSON.stringify(values) }));
      } else {
        onAdded(
          await api<LoggedSet>(`/api/training/sessions/${sessionId}/sets`, {
            method: "POST",
            body: JSON.stringify({
              exercise_id: slot.exerciseId,
              planned_exercise_id: slot.planned?.exercise_id ?? null,
              plan_occurrence: slot.occurrence,
              ...values,
            }),
          }),
        );
      }
      reset();
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: LoggedSet) {
    if (!confirm(`Delete set ${formatSet(s, loadType)}?`)) return;
    await api(`/api/training/sets/${s.id}`, { method: "DELETE" });
    onDeleted(s.id);
    if (editing?.id === s.id) reset();
  }

  // 16px text: iOS Safari zooms the page into any smaller input when it's focused.
  const field =
    "rounded-md border border-hairline bg-page px-2 py-2 text-center text-base text-ink tabular-nums outline-none focus:border-accent";

  return (
    <section className="rounded-xl border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">
            {exercise?.name ?? "…"}
            {loadType === "per_side" && <span className="ml-2 text-xs font-normal text-muted">per side</span>}
          </h2>
          {plannedName && <p className="text-xs text-ink-2">instead of {plannedName}</p>}
          {slot.planned && (
            <p className="text-sm text-ink-2">
              {target(slot.planned)}
              {slot.planned.notes && <span className="text-muted"> · {slot.planned.notes}</span>}
            </p>
          )}
        </div>
        {slot.planned && !picking && (
          <button onClick={onStartSwap} className="shrink-0 text-sm text-accent">
            Swap
          </button>
        )}
      </div>

      {picking && (
        <div className="mt-2">
          <ExercisePicker onPick={onSwap} onCancel={onCancelSwap} placeholder="What did you do instead?" />
        </div>
      )}

      <p className="mt-2 text-sm text-muted">
        {last && differentExercise ? (
          <>
            Last · {shortDate(last.day)}: did {last.exercise_name} instead, {last.summary}
          </>
        ) : last ? (
          <>
            Last · {shortDate(last.day)}
            {otherDay && ` (${otherDay})`}: {last.sets.map((s) => formatSet(s, loadType)).join(", ")}
          </>
        ) : (
          "No previous sets"
        )}
      </p>

      {slot.sets.length > 0 && (
        <ol className="mt-2 divide-y divide-grid">
          {slot.sets.map((s, i) => (
            <li key={s.id} className={`flex items-center gap-3 py-1.5 ${editing?.id === s.id ? "bg-accent-wash" : ""}`}>
              <span className="w-5 text-right text-sm text-muted tabular-nums">{i + 1}</span>
              <button onClick={() => startEdit(s)} className="flex-1 text-left tabular-nums">
                {formatSet(s, s.exercise_id === slot.exerciseId ? loadType : "total")}
                {s.notes && <span className="text-sm text-ink-2"> · {s.notes}</span>}
              </button>
              <button onClick={() => remove(s)} className="px-1 text-muted hover:text-critical" aria-label="Delete set">
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col text-xs text-muted">
          kg{loadType === "per_side" ? "/side" : ""}
          <input inputMode="decimal" value={shown.weight} onChange={(e) => update("weight", e.target.value)} className={`${field} w-20`} />
        </label>
        <label className="flex flex-col text-xs text-muted">
          reps
          <input inputMode="numeric" value={shown.reps} onChange={(e) => update("reps", e.target.value)} className={`${field} w-16`} />
        </label>
        <label className="flex flex-col text-xs text-muted">
          RIR
          <input inputMode="decimal" value={shown.rir} onChange={(e) => update("rir", e.target.value)} className={`${field} w-14`} />
        </label>
        <label className="flex min-w-32 flex-1 flex-col text-xs text-muted">
          note
          <input value={shown.notes} onChange={(e) => update("notes", e.target.value)} className={`${field} text-left`} />
        </label>
        <button
          type="submit"
          disabled={busy || (!shown.weight && !shown.reps)}
          className="rounded-md bg-accent px-4 py-2 font-medium text-accent-ink disabled:opacity-50"
        >
          {editing ? "Save" : "Add set"}
        </button>
        {(editing || touched) && (
          <button type="button" onClick={reset} className="py-2 text-sm text-muted hover:text-ink">
            Cancel
          </button>
        )}
      </form>
    </section>
  );
}
