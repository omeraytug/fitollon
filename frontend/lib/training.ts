export type LoadType = "total" | "per_side";

export type Exercise = { id: number; name: string; load_type: LoadType; notes: string | null };

export type PlannedExercise = {
  exercise_id: number;
  name: string;
  load_type: LoadType;
  sets: number | null;
  rep_min: number | null;
  rep_max: number | null;
  rir_target: string | null;
  notes: string | null;
};

export type Template = {
  id: number;
  program_id: number;
  name: string;
  position: number;
  notes: string | null;
  exercises: PlannedExercise[];
};

export type ProgramSummary = {
  id: number;
  name: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  session_names: string[];
  logged_sessions: number;
  first_day: string | null;
  last_day: string | null;
};

export type ProgramDetail = ProgramSummary & { templates: Template[]; next_template_id: number | null };

export type SessionRef = { id: number; day: string; title: string; set_count: number; program_name: string | null };

export type CycleSlot = {
  template_id: number;
  name: string;
  status: "done" | "skipped" | "next" | "upcoming";
  session: SessionRef | null;
};

export type Cycle = {
  number: number;
  current: boolean;
  first_day: string | null;
  last_day: string | null;
  slots: CycleSlot[];
};

export type Overview = {
  program: { id: number; name: string; is_active: boolean } | null;
  templates: { id: number; name: string }[];
  next_template_id: number | null;
  cycles: Cycle[]; // newest first; the first is the current one for the active program
  other_sessions: SessionRef[];
};

export type LoggedSet = {
  id: number;
  exercise_id: number;
  planned_exercise_id: number | null;
  plan_occurrence: number | null;
  position: number;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
  notes: string | null;
};

export type LastTime = {
  session_id: number;
  day: string;
  template_name: string | null;
  exercise_id: number;
  exercise_name: string;
  sets: { weight_kg: number | null; reps: number | null; rir: number | null; notes: string | null }[];
  summary: string;
};

export type SessionDetail = {
  id: number;
  day: string;
  title: string | null;
  notes: string | null;
  template: Template | null;
  sets: LoggedSet[];
  exercises: Record<string, Exercise>;
  slot_last_time: (LastTime | null)[];
  last_time: Record<string, LastTime | null>;
};


export function repRange(min: number | null, max: number | null): string | null {
  if (min && max && min !== max) return `${min}–${max}`;
  const value = min ?? max;
  return value ? String(value) : null;
}

export function target(p: PlannedExercise): string {
  const parts = [];
  const reps = repRange(p.rep_min, p.rep_max);
  if (p.sets && reps) parts.push(`${p.sets} × ${reps}`);
  else if (p.sets) parts.push(`${p.sets} sets`);
  else if (reps) parts.push(`${reps} reps`);
  if (p.rir_target) parts.push(`RIR ${p.rir_target}`);
  return parts.join(" · ");
}

export function formatSet(s: { weight_kg: number | null; reps: number | null; rir: number | null }, loadType: LoadType): string {
  const parts = [];
  if (s.weight_kg !== null) parts.push(`${s.weight_kg} kg${loadType === "per_side" ? "/side" : ""}`);
  if (s.reps !== null) parts.push(`× ${s.reps}`);
  let text = parts.join(" ") || "set";
  if (s.rir !== null) text += ` · RIR ${s.rir}`;
  return text;
}

export function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export type Slot = {
  key: string;
  planned: PlannedExercise | null;
  occurrence: number | null; // which "Biceps of choice" this is, when the template lists one twice
  exerciseId: number; // what is being done in the slot (differs from the plan after a swap)
  sets: LoggedSet[];
  slotLast: LastTime | null; // what was done in this slot the last time this session came around
};
/** Group logged sets under the plan's slots (including swaps), then any extra exercises. */
export function buildSlots(data: SessionDetail, swaps: Record<string, number>, extras: number[]): Slot[] {
  const claimed = new Set<number>();
  const seen: Record<number, number> = {};
  const slots: Slot[] = (data.template?.exercises ?? []).map((planned, i) => {
    const key = `plan-${i}`;
    const occurrence = seen[planned.exercise_id] ?? 0;
    seen[planned.exercise_id] = occurrence + 1;
    const sets = data.sets.filter(
      (s) =>
        !claimed.has(s.id) &&
        ((s.planned_exercise_id === planned.exercise_id && (s.plan_occurrence ?? 0) === occurrence) ||
          (s.planned_exercise_id === null && occurrence === 0 && s.exercise_id === planned.exercise_id)),
    );
    sets.forEach((s) => claimed.add(s.id));
    const exerciseId = swaps[key] ?? sets.at(-1)?.exercise_id ?? planned.exercise_id;
    return { key, planned, occurrence, exerciseId, sets, slotLast: data.slot_last_time[i] ?? null };
  });
  const extraIds = [...new Set([...data.sets.filter((s) => !claimed.has(s.id)).map((s) => s.exercise_id), ...extras])];
  for (const exerciseId of extraIds) {
    const sets = data.sets.filter((s) => !claimed.has(s.id) && s.exercise_id === exerciseId);
    slots.push({ key: `extra-${exerciseId}`, planned: null, occurrence: null, exerciseId, sets, slotLast: null });
  }
  return slots;
}

