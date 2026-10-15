"use client";

import { ArrowDown, ArrowUp, Check, Copy, Pencil, Plus, Trash2, X } from "lucide-react";
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

export default function ProgramPage() {
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProgramDetail | null>(null);
  const [history, setHistory] = useState<Overview | null>(null);
  const [creating, setCreating] = useState(false);

  const loadPrograms = useCallback(async (select?: number) => {
    const list = await api<ProgramSummary[]>("/api/training/programs");
    setPrograms(list);
    const fromUrl = Number(new URLSearchParams(window.location.search).get("id"));
    const wanted = select ?? (list.some((p) => p.id === fromUrl) ? fromUrl : undefined);
    setSelectedId((current) => wanted ?? (list.some((p) => p.id === current) ? current : (list[0]?.id ?? null)));
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    const program = await api<ProgramDetail>(`/api/training/programs/${id}`);
    setDetail(program);
    setHistory(program.is_active ? null : await api<Overview>(`/api/training/overview?program_id=${id}`));
  }, []);

  useEffect(() => {
    // Initial load; state updates happen after the request resolves.
    const timer = setTimeout(() => loadPrograms(), 0);
    return () => clearTimeout(timer);
  }, [loadPrograms]);

  useEffect(() => {
    if (selectedId === null) return;
    window.history.replaceState(null, "", `/program?id=${selectedId}`);
    const timer = setTimeout(() => loadDetail(selectedId), 0);
    return () => clearTimeout(timer);
  }, [selectedId, loadDetail]);

  async function refresh(select?: number) {
    await loadPrograms(select);
    if ((select ?? selectedId) !== null) await loadDetail((select ?? selectedId)!);
  }

  async function activate() {
    await api(`/api/training/programs/${detail!.id}/activate`, { method: "POST" });
    refresh();
  }

  async function duplicate() {
    const copy = await api<ProgramSummary>("/api/training/programs", {
      method: "POST",
      body: JSON.stringify({ name: `${detail!.name} (copy)`, copy_from: detail!.id }),
    });
    refresh(copy.id);
  }

  async function remove() {
    if (!confirm(`Delete ${detail!.name}? Sessions you logged with it are kept, but no longer linked to its plan.`)) return;
    await api(`/api/training/programs/${detail!.id}`, { method: "DELETE" });
    setDetail(null);
    setSelectedId(null);
    refresh(programs!.find((p) => p.is_active)?.id);
  }

  async function addSession() {
    await api(`/api/training/programs/${detail!.id}/templates`, {
      method: "POST",
      body: JSON.stringify({ name: `Day ${detail!.templates.length + 1}`, exercises: [] }),
    });
    loadDetail(detail!.id);
  }

  async function move(id: number, direction: "up" | "down") {
    await api(`/api/training/templates/${id}/move?direction=${direction}`, { method: "POST" });
    loadDetail(detail!.id);
  }

  async function removeTemplate(template: Template) {
    if (!confirm(`Delete ${template.name} from ${detail!.name}? Logged sessions are kept.`)) return;
    await api(`/api/training/templates/${template.id}`, { method: "DELETE" });
    loadDetail(detail!.id);
  }

  if (!programs) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-9 w-40 rounded-lg" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="rise text-3xl font-semibold tracking-tight">Program</h1>

      <div className="rise -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={stagger(1)} role="tablist" aria-label="Programs">
        {programs.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === selectedId}
            onClick={() => {
              setCreating(false);
              setSelectedId(p.id);
            }}
            className={`press flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm ${
              p.id === selectedId && !creating
                ? "border-accent bg-accent-wash font-medium text-ink"
                : "border-hairline bg-surface text-ink-2 hover:text-ink"
            }`}
          >
            {p.is_active && <span className="size-2 rounded-full bg-good" aria-label="Active" />}
            {p.name}
          </button>
        ))}
        <button
          onClick={() => setCreating(true)}
          className={`press flex shrink-0 items-center gap-1 rounded-full border border-dashed px-4 py-2 text-sm ${
            creating ? "border-accent text-ink" : "border-hairline text-ink-2 hover:text-ink"
          }`}
        >
          <Plus size={15} />
          New program
        </button>
      </div>

      {creating || programs.length === 0 ? (
        <NewProgram
          programs={programs}
          onCancel={programs.length ? () => setCreating(false) : undefined}
          onCreated={(id) => {
            setCreating(false);
            refresh(id);
          }}
        />
      ) : (
        detail &&
        detail.id === selectedId && (
          <>
            <ProgramHeader
              key={detail.id}
              program={detail}
              onRename={async (name) => {
                await api(`/api/training/programs/${detail.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
                refresh();
              }}
              onActivate={activate}
              onDuplicate={duplicate}
              onDelete={remove}
            />

            {detail.templates.map((t, i) => (
              <TemplateEditor
                key={t.id}
                template={t}
                index={i}
                first={i === 0}
                last={i === detail.templates.length - 1}
                onMove={(direction) => move(t.id, direction)}
                onDelete={() => removeTemplate(t)}
                onSaved={() => loadDetail(detail.id)}
              />
            ))}

            <button
              onClick={addSession}
              className="press flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-hairline py-3 text-sm text-ink-2 hover:border-accent hover:text-ink"
            >
              <Plus size={15} />
              Add session to the cycle
            </button>

            {history && history.cycles.length > 0 && (
              <section className="rise rounded-2xl border border-hairline bg-surface p-5" style={stagger(3)}>
                <h2 className="font-medium">Logged with this program</h2>
                <div className="mt-1 divide-y divide-grid">
                  {history.cycles.map((cycle) => (
                    <CompactCycle key={cycle.number} cycle={cycle} />
                  ))}
                </div>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}

function ProgramHeader({
  program,
  onRename,
  onActivate,
  onDuplicate,
  onDelete,
}: {
  program: ProgramDetail;
  onRename: (name: string) => Promise<void>;
  onActivate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(program.name);

  const logged =
    program.logged_sessions > 0 && program.first_day && program.last_day
      ? `${program.logged_sessions} logged · ${shortDate(program.first_day)} – ${shortDate(program.last_day)}`
      : "nothing logged yet";

  return (
    <section className="rise rounded-2xl border border-hairline bg-surface p-5" style={stagger(2)}>
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              await onRename(name.trim());
              setEditing(false);
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${field} min-w-0 flex-1 text-lg font-semibold`}
              aria-label="Program name"
            />
            <button type="submit" className="press grid size-9 place-items-center rounded-full bg-accent text-accent-ink" aria-label="Save name">
              <Check size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setName(program.name);
                setEditing(false);
              }}
              className="press grid size-9 place-items-center rounded-full text-muted hover:text-ink"
              aria-label="Cancel"
            >
              <X size={16} />
            </button>
          </form>
        ) : (
          <>
            <h2 className="text-xl font-semibold tracking-tight">{program.name}</h2>
            <button onClick={() => setEditing(true)} className="press text-muted hover:text-ink" aria-label="Rename">
              <Pencil size={15} />
            </button>
            {program.is_active && (
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-accent-wash px-3 py-1 text-xs font-medium text-ink">
                <span className="size-2 rounded-full bg-good" />
                Active
              </span>
            )}
          </>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        {program.session_names.length} sessions per cycle · {logged}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!program.is_active && (
          <button onClick={onActivate} className="press flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink">
            <Check size={15} />
            Make active
          </button>
        )}
        <button onClick={onDuplicate} className={`${pill} text-ink-2 hover:border-accent hover:text-ink`}>
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
      className="rise rounded-2xl border border-hairline bg-surface p-5"
      style={stagger(2)}
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
      <section className="rise rounded-2xl border border-hairline bg-surface p-4 sm:p-5" style={stagger(3 + index)}>
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
    <section className="rise rounded-2xl border border-accent/40 bg-surface p-4 sm:p-5" style={stagger(3 + index)}>
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
