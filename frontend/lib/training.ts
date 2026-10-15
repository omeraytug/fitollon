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
  name: string;
  position: number;
  notes: string | null;
  exercises: PlannedExercise[];
};

export type Program = { templates: Template[]; next_template_id: number | null };

export type LoggedSet = {
  id: number;
  exercise_id: number;
  planned_exercise_id: number | null;
  position: number;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
  notes: string | null;
};

export type LastTime = {
  session_id: number;
  day: string;
  substituted_by: string | null;
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
  last_time: Record<string, LastTime>;
};

export type SessionSummary = { id: number; day: string; title: string; set_count: number; exercises: string[] };

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
