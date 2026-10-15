"use client";

import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CompactCycle } from "@/components/cycle";
import { ExercisePicker } from "@/components/exercise-picker";
import { api } from "@/lib/api";
import {
  shortDate,
  target,
  type LoadType,
  type Overview,
  type PlannedExercise,
  type ProgramDetail,
  type ProgramSummary,
  type Template,
} from "@/lib/training";

const field = "rounded-lg border border-hairline bg-page px-2 py-1.5 outline-none focus:border-accent";
const pill = "press flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-sm";

function stagger(i: number) {
  return { "--i": i } as React.CSSProperties;
}

type Loaded = { detail: ProgramDetail; history: Overview | null };

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [open, setOpen] = useState<number[]>([]);
  const [loaded, setLoaded] = useState<Record<number, Loaded>>({});
  const [creating, setCreating] = useState(false);

  const loadPrograms = useCallback(async () => {
    setPrograms(await api<ProgramSummary[]>("/api/training/programs"));
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    const detail = await api<ProgramDetail>(`/api/training/programs/${id}`);
    const history = detail.is_active ? null : await api<Overview>(`/api/training/overview?program_id=${id}`);
    setLoaded((current) => ({ ...current, [id]: { detail, history } }));
  }, []);

  useEffect(() => {
    // Initial load; state updates happen after the request resolves.
    const timer = setTimeout(() => loadPrograms(), 0);
    return () => clearTimeout(timer);
  }, [loadPrograms]);

  function toggle(id: number) {
    if (open.includes(id)) {
      setOpen(open.filter((o) => o !== id));
    } else {
      setOpen([...open, id]);
      loadDetail(id);
    }
  }

  async function reload(ids: number[] = open) {
    await Promise.all([loadPrograms(), ...ids.map(loadDetail)]);
  }

  async function openProgram(id: number) {
    setOpen((current) => (current.includes(id) ? current : [...current, id]));
    await reload([...open, id]);
  }

  async function remove(program: ProgramSummary) {
    if (!confirm(`Delete ${program.name}? Sessions you logged with it are kept, but no longer linked to its plan.`)) return;
    await api(`/api/training/programs/${program.id}`, { method: "DELETE" });
    setOpen(open.filter((o) => o !== program.id));
    loadPrograms();
  }

  if (!programs) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-9 w-40 rounded-lg" />
        <div className="skeleton h-20 rounded-2xl" />
        <div className="skeleton h-20 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rise mb-1 flex items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Programs</h1>
        {programs.length > 0 && !creating && (
          <button onClick={() => setCreating(true)} className={`${pill} text-ink-2 hover:border-accent hover:text-ink`}>
            <Plus size={15} />
            New program
          </button>
        )}
      </div>

      {(creating || programs.length === 0) && (
        <NewProgram
          programs={programs}
          onCancel={programs.length ? () => setCreating(false) : undefined}
          onCreated={(id) => {
            setCreating(false);
            openProgram(id);
          }}
        />
      )}

      {programs.map((p, i) => (
        <ProgramCard
          key={p.id}
          program={p}
          i={i + 1}
          open={open.includes(p.id)}
          loaded={loaded[p.id]}
          onToggle={() => toggle(p.id)}
          onChanged={() => reload()}
          onDuplicated={openProgram}
          onDelete={() => remove(p)}
        />
      ))}
    </div>
  );
}

function ProgramCard({
  program,
  i,
  open,
  loaded,
  onToggle,
  onChanged,
  onDuplicated,
  onDelete,
}: {
  program: ProgramSummary;
  i: number;
  open: boolean;
  loaded: Loaded | undefined;
  onToggle: () => void;
  onChanged: () => Promise<void>;
  onDuplicated: (id: number) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(program.name);
  const detail = loaded?.detail;

  const logged =
    program.logged_sessions > 0 && program.first_day && program.last_day
      ? `${program.logged_sessions} logged · ${shortDate(program.first_day)} – ${shortDate(program.last_day)}`
      : "nothing logged yet";

  async function call(path: string, init: RequestInit) {
    await api(path, init);
    await onChanged();
  }

  async function duplicate() {
    const copy = await api<ProgramSummary>("/api/training/programs", {
      method: "POST",
      body: JSON.stringify({ name: `${program.name} (copy)`, copy_from: program.id }),
    });
    onDuplicated(copy.id);
  }

  return (
    <section
      className={`rise rounded-2xl border bg-surface transition-colors ${open ? "border-accent/40" : "border-hairline"}`}
      style={stagger(i)}
    >
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left sm:p-5">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-lg font-semibold tracking-tight">{program.name}</span>
            {program.is_active && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-wash px-2.5 py-0.5 text-xs font-medium text-ink">
                <span className="size-2 rounded-full bg-good" />
                Active
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-sm text-muted">
            {program.session_names.length} sessions per cycle · {logged}
          </span>
        </span>
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${open ? "bg-accent-wash text-accent" : "text-ink-2"}`}>
          <ChevronDown size={20} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="rise flex flex-col gap-3 border-t border-grid p-4 sm:p-5">
          {renaming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!name.trim()) return;
                await call(`/api/training/programs/${program.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ name: name.trim() }),
                });
                setRenaming(false);
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${field} min-w-0 flex-1 px-3 py-2 text-base`}
                aria-label="Program name"
              />
              <button type="submit" className="press grid size-9 place-items-center rounded-full bg-accent text-accent-ink" aria-label="Save name">
                <Check size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setName(program.name);
                  setRenaming(false);
                }}
                className="press grid size-9 place-items-center rounded-full text-muted hover:text-ink"
                aria-label="Cancel"
              >
                <X size={16} />
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!program.is_active && (
                <button
                  onClick={() => call(`/api/training/programs/${program.id}/activate`, { method: "POST" })}
                  className="press flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink"
                >
                  <Check size={15} />
                  Make active
                </button>
              )}
              <button onClick={() => setRenaming(true)} className={`${pill} text-ink-2 hover:border-accent hover:text-ink`}>
                <Pencil size={14} />
                Rename
              </button>
              <button onClick={duplicate} className={`${pill} text-ink-2 hover:border-accent hover:text-ink`}>
                <Copy size={14} />
                Duplicate
              </button>
              {!program.is_active && (
                <button onClick={onDelete} className={`${pill} text-muted hover:border-critical hover:text-critical`}>
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
            </div>
          )}

          {!detail ? (
            <div className="skeleton h-32 rounded-xl" />
          ) : (
            <>
              {detail.templates.map((t, n) => (
                <TemplateEditor
                  key={t.id}
                  template={t}
                  index={n}
                  first={n === 0}
                  last={n === detail.templates.length - 1}
                  onMove={(direction) =>
                    call(`/api/training/templates/${t.id}/move?direction=${direction}`, { method: "POST" })
                  }
                  onDelete={() => {
                    if (confirm(`Delete ${t.name} from ${program.name}? Logged sessions are kept.`)) {
                      call(`/api/training/templates/${t.id}`, { method: "DELETE" });
                    }
                  }}
                  onSaved={onChanged}
                />
              ))}
              <button
                onClick={() =>
                  call(`/api/training/programs/${program.id}/templates`, {
                    method: "POST",
                    body: JSON.stringify({ name: `Day ${detail.templates.length + 1}`, exercises: [] }),
                  })
                }
                className="press flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline py-3 text-sm text-ink-2 hover:border-accent hover:text-ink"
              >
                <Plus size={15} />
                Add session to the cycle
              </button>

              {loaded.history && loaded.history.cycles.length > 0 && (
                <div className="mt-2">
                  <h3 className="font-medium">Logged with this program</h3>
                  <div className="divide-y divide-grid">
                    {loaded.history.cycles.map((cycle) => (
                      <CompactCycle key={cycle.number} cycle={cycle} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function NewProgram({
  programs,
  onCreated,
  onCancel,
}: {
  programs: ProgramSummary[];
  onCreated: (id: number) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState(String(programs.find((p) => p.is_active)?.id ?? ""));

  return (
    <form
      className="rise rounded-2xl border border-accent/40 bg-surface p-5"
      style={stagger(1)}
      onSubmit={async (e) => {
        e.preventDefault();
        const created = await api<ProgramSummary>("/api/training/programs", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), copy_from: copyFrom ? Number(copyFrom) : null }),
        });
        onCreated(created.id);
      }}
    >
      <h2 className="text-lg font-semibold">New program</h2>
      <label className="mt-4 block text-sm font-medium" htmlFor="program-name">
        Name
      </label>
      <input
        id="program-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Block 2"
        className={`${field} mt-1 w-full px-3 py-2`}
      />
      {programs.length > 0 && (
        <>
          <label className="mt-4 block text-sm font-medium" htmlFor="program-copy">
            Start from
          </label>
          <select
            id="program-copy"
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
            className={`${field} mt-1 w-full px-3 py-2`}
          >
            <option value="">An empty program</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                A copy of {p.name}
              </option>
            ))}
          </select>
        </>
      )}
      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={!name.trim()}
          className="press rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          Create
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-ink">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function TemplateEditor({
  template,
  index,
  first,
  last,
  onMove,
  onDelete,
  onSaved,
}: {
  template: Template;
  index: number;
  first: boolean;
  last: boolean;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [rows, setRows] = useState<PlannedExercise[]>(template.exercises);
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState(template.exercises.length === 0);

  const dirty = name !== template.name || JSON.stringify(rows) !== JSON.stringify(template.exercises);

  function cancel() {
    setName(template.name);
    setRows(template.exercises);
    setPicking(false);
    setOpen(false);
  }

  function edit(i: number, patch: Partial<PlannedExercise>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  function shift(i: number, by: -1 | 1) {
    setRows((r) => {
      const next = [...r];
      const [row] = next.splice(i, 1);
      next.splice(i + by, 0, row);
      return next;
    });
  }

  async function setLoadType(i: number, loadType: LoadType) {
    await api(`/api/training/exercises/${rows[i].exercise_id}`, {
      method: "PATCH",
      body: JSON.stringify({ load_type: loadType }),
    });
    edit(i, { load_type: loadType });
  }

  async function save() {
    const saved = await api<Template>(`/api/training/templates/${template.id}`, {
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
    setOpen(false);
    onSaved();
  }

  const num = (v: string) => (v === "" ? null : Number(v));
  const small = `${field} text-center text-base text-ink sm:text-sm`;
  const badge = (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-wash text-sm font-semibold text-accent">
      {index + 1}
    </span>
  );
  const moves = (
    <>
      <button disabled={first} onClick={() => onMove("up")} className="press p-1.5 text-ink-2 disabled:opacity-30" aria-label="Move earlier in the cycle">
        <ArrowUp size={16} />
      </button>
      <button disabled={last} onClick={() => onMove("down")} className="press p-1.5 text-ink-2 disabled:opacity-30" aria-label="Move later in the cycle">
        <ArrowDown size={16} />
      </button>
    </>
  );

  if (!open) {
    return (
      <section className="rise rounded-xl border border-grid p-4" style={stagger(index + 1)}>
        <div className="flex items-center gap-2">
          {badge}
          <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{template.name}</h3>
          {moves}
          <button
            onClick={() => setOpen(true)}
            className="press ml-1 flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-sm text-ink-2 hover:border-accent hover:text-ink"
          >
            <Pencil size={13} />
            Edit
          </button>
        </div>
        <ul className="mt-3 divide-y divide-grid">
          {template.exercises.map((e, i) => (
            <li key={`${e.exercise_id}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
              <span>
                {e.name}
                {e.load_type === "per_side" && <span className="ml-1.5 text-xs text-muted">per side</span>}
                {e.notes && <span className="block text-xs text-muted">{e.notes}</span>}
              </span>
              <span className="text-sm text-ink-2 tabular-nums">{target(e) || "—"}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-accent/40 p-4">
      <div className="flex items-center gap-2">
        {badge}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${field} min-w-0 flex-1 text-lg font-semibold`}
          aria-label="Session name"
        />
      </div>

      <ol className="mt-3 flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={`${row.exercise_id}-${i}`} className="rounded-xl border border-grid p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{row.name}</span>
              <span className="flex items-center text-ink-2">
                <button disabled={i === 0} onClick={() => shift(i, -1)} className="press p-1 disabled:opacity-30" aria-label="Move up">
                  <ArrowUp size={15} />
                </button>
                <button disabled={i === rows.length - 1} onClick={() => shift(i, 1)} className="press p-1 disabled:opacity-30" aria-label="Move down">
                  <ArrowDown size={15} />
                </button>
                <button onClick={() => setRows((r) => r.filter((_, j) => j !== i))} className="press p-1 hover:text-critical" aria-label="Remove">
                  <X size={15} />
                </button>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2 text-xs text-muted">
              <label className="flex flex-col">
                sets
                <input inputMode="numeric" value={row.sets ?? ""} onChange={(e) => edit(i, { sets: num(e.target.value) })} className={`${small} w-14`} />
              </label>
              <label className="flex flex-col">
                reps from
                <input inputMode="numeric" value={row.rep_min ?? ""} onChange={(e) => edit(i, { rep_min: num(e.target.value) })} className={`${small} w-16`} />
              </label>
              <label className="flex flex-col">
                to
                <input inputMode="numeric" value={row.rep_max ?? ""} onChange={(e) => edit(i, { rep_max: num(e.target.value) })} className={`${small} w-16`} />
              </label>
              <label className="flex flex-col">
                RIR
                <input value={row.rir_target ?? ""} onChange={(e) => edit(i, { rir_target: e.target.value })} placeholder="0-1" className={`${small} w-16`} />
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
          <button onClick={() => setPicking(true)} className="flex items-center gap-1 text-sm text-accent">
            <Plus size={15} />
            Add exercise
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-grid pt-3">
        <button
          onClick={save}
          disabled={!dirty || !name.trim()}
          className="press rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={cancel} className="text-sm text-muted hover:text-ink">
          {dirty ? "Discard changes" : "Close"}
        </button>
        <button onClick={onDelete} className="press ml-auto p-1.5 text-muted hover:text-critical" aria-label={`Delete ${template.name}`}>
          <Trash2 size={16} />
        </button>
      </div>
    </section>
  );
}
