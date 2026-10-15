"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ExercisePicker } from "@/components/exercise-picker";
import { api } from "@/lib/api";
import type { LoadType, PlannedExercise, Program, Template } from "@/lib/training";

const field = "rounded-md border border-hairline bg-page px-2 py-1.5 outline-none focus:border-accent";

export default function ProgramPage() {
  const [program, setProgram] = useState<Program | null>(null);

  const load = () => api<Program>("/api/training/program").then(setProgram);
  useEffect(() => {
    load();
  }, []);

  async function addDay() {
    const count = program?.templates.length ?? 0;
    await api("/api/training/program/templates", {
      method: "POST",
      body: JSON.stringify({ name: `Day ${count + 1}`, exercises: [] }),
    });
    load();
  }

  async function move(id: number, direction: "up" | "down") {
    await api(`/api/training/program/templates/${id}/move?direction=${direction}`, { method: "POST" });
    load();
  }

  async function remove(template: Template) {
    if (!confirm(`Delete ${template.name} from your program? Logged sessions are kept.`)) return;
    await api(`/api/training/program/templates/${template.id}`, { method: "DELETE" });
    load();
  }

  if (!program) return <p className="text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/training" className="text-sm text-muted hover:text-ink">
          ← Training
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Program</h1>
        <p className="mt-1 text-sm text-ink-2">
          The sessions of your cycle, in order. After the last one, the cycle starts over.
        </p>
      </div>

      {program.templates.map((t, i) => (
        <TemplateEditor
          key={t.id}
          template={t}
          first={i === 0}
          last={i === program.templates.length - 1}
          onMove={(direction) => move(t.id, direction)}
          onDelete={() => remove(t)}
          onSaved={load}
        />
      ))}

      <button
        onClick={addDay}
        className="rounded-xl border border-dashed border-hairline py-3 text-sm text-ink-2 hover:border-accent hover:text-ink"
      >
        + Add session to the cycle
      </button>
    </div>
  );
}

function TemplateEditor({
  template,
  first,
  last,
  onMove,
  onDelete,
  onSaved,
}: {
  template: Template;
  first: boolean;
  last: boolean;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [rows, setRows] = useState<PlannedExercise[]>(template.exercises);
  const [picking, setPicking] = useState(false);
  const [status, setStatus] = useState("");

  const dirty = name !== template.name || JSON.stringify(rows) !== JSON.stringify(template.exercises);

  function edit(index: number, patch: Partial<PlannedExercise>) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function shift(index: number, by: -1 | 1) {
    setRows((r) => {
      const next = [...r];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });
  }

  async function setLoadType(index: number, loadType: LoadType) {
    await api(`/api/training/exercises/${rows[index].exercise_id}`, {
      method: "PATCH",
      body: JSON.stringify({ load_type: loadType }),
    });
    edit(index, { load_type: loadType });
  }

  async function save() {
    const saved = await api<Template>(`/api/training/program/templates/${template.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name,
        notes: template.notes,
        exercises: rows.map(({ exercise_id, sets, rep_min, rep_max, rir_target, notes }) => ({
          exercise_id,
          sets,
          rep_min,
          rep_max,
          rir_target: rir_target || null,
          notes: notes || null,
        })),
      }),
    });
    setName(saved.name);
    setRows(saved.exercises);
    setStatus("Saved");
    setTimeout(() => setStatus(""), 2000);
    onSaved();
  }

  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <section className="rounded-xl border border-hairline bg-surface p-4">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${field} min-w-0 flex-1 text-lg font-semibold`}
          aria-label="Session name"
        />
        <button disabled={first} onClick={() => onMove("up")} className="px-2 text-ink-2 disabled:opacity-30" aria-label="Move earlier">
          ↑
        </button>
        <button disabled={last} onClick={() => onMove("down")} className="px-2 text-ink-2 disabled:opacity-30" aria-label="Move later">
          ↓
        </button>
      </div>

      <ol className="mt-3 flex flex-col gap-3">
        {rows.map((row, i) => (
          <li key={`${row.exercise_id}-${i}`} className="rounded-lg border border-grid p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{row.name}</span>
              <span className="flex items-center gap-1 text-ink-2">
                <button disabled={i === 0} onClick={() => shift(i, -1)} className="px-1.5 disabled:opacity-30" aria-label="Move up">
                  ↑
                </button>
                <button disabled={i === rows.length - 1} onClick={() => shift(i, 1)} className="px-1.5 disabled:opacity-30" aria-label="Move down">
                  ↓
                </button>
                <button onClick={() => setRows((r) => r.filter((_, j) => j !== i))} className="px-1.5 hover:text-critical" aria-label="Remove">
                  ×
                </button>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2 text-xs text-muted">
              <label className="flex flex-col">
                sets
                <input inputMode="numeric" value={row.sets ?? ""} onChange={(e) => edit(i, { sets: num(e.target.value) })} className={`${field} w-14 text-center text-base text-ink sm:text-sm`} />
              </label>
              <label className="flex flex-col">
                reps from
                <input inputMode="numeric" value={row.rep_min ?? ""} onChange={(e) => edit(i, { rep_min: num(e.target.value) })} className={`${field} w-16 text-center text-base text-ink sm:text-sm`} />
              </label>
              <label className="flex flex-col">
                to
                <input inputMode="numeric" value={row.rep_max ?? ""} onChange={(e) => edit(i, { rep_max: num(e.target.value) })} className={`${field} w-16 text-center text-base text-ink sm:text-sm`} />
              </label>
              <label className="flex flex-col">
                RIR
                <input value={row.rir_target ?? ""} onChange={(e) => edit(i, { rir_target: e.target.value })} placeholder="0-1" className={`${field} w-16 text-center text-base text-ink sm:text-sm`} />
              </label>
              <label className="flex flex-col">
                weight is
                <select value={row.load_type} onChange={(e) => setLoadType(i, e.target.value as LoadType)} className={`${field} text-base text-ink sm:text-sm`}>
                  <option value="total">total</option>
                  <option value="per_side">per side</option>
                </select>
              </label>
              <label className="flex min-w-40 flex-1 flex-col">
                setup note
                <input value={row.notes ?? ""} onChange={(e) => edit(i, { notes: e.target.value })} placeholder="e.g. seat 7" className={`${field} text-base text-ink sm:text-sm`} />
              </label>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3">
        {picking ? (
          <ExercisePicker
            onCancel={() => setPicking(false)}
            onPick={(e) => {
              setRows((r) => [
                ...r,
                { exercise_id: e.id, name: e.name, load_type: e.load_type, sets: null, rep_min: null, rep_max: null, rir_target: null, notes: null },
              ]);
              setPicking(false);
            }}
          />
        ) : (
          <button onClick={() => setPicking(true)} className="text-sm text-accent">
            + Add exercise
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-grid pt-3">
        <button
          onClick={save}
          disabled={!dirty || !name.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
        >
          Save {name || "session"}
        </button>
        {status && <span className="text-sm text-good">{status}</span>}
        {dirty && !status && <span className="text-sm text-muted">Unsaved changes</span>}
        <button onClick={onDelete} className="ml-auto text-sm text-muted hover:text-critical">
          Delete
        </button>
      </div>
    </section>
  );
}
