"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import type { Exercise, LoadType } from "@/lib/training";

/** Search your exercises, or create a new one (choosing whether its weight is total or per side). */
export function ExercisePicker({
  onPick,
  onCancel,
  placeholder = "Search or add exercise…",
}: {
  onPick: (exercise: Exercise) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState("");
  const [loadType, setLoadType] = useState<LoadType>("total");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Exercise[]>("/api/training/exercises").then(setExercises);
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const matches = exercises.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8);
  const exact = exercises.some((e) => e.name.toLowerCase() === q);

  async function create() {
    const exercise = await api<Exercise>("/api/training/exercises", {
      method: "POST",
      body: JSON.stringify({ name: query.trim(), load_type: loadType }),
    });
    onPick(exercise);
  }

  return (
    <div className="rounded-lg border border-accent bg-surface p-2">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-md border border-hairline bg-page px-3 py-2 outline-none focus:border-accent"
        />
        <button onClick={onCancel} className="px-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
      </div>
      <ul className="mt-1">
        {matches.map((e) => (
          <li key={e.id}>
            <button
              onClick={() => onPick(e)}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent-wash"
            >
              <span>{e.name}</span>
              {e.load_type === "per_side" && <span className="text-xs text-muted">per side</span>}
            </button>
          </li>
        ))}
      </ul>
      {q && !exact && (
        <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-grid px-1 pt-2 text-sm">
          <span className="text-ink-2">New exercise, weight is</span>
          {(["total", "per_side"] as const).map((lt) => (
            <button
              key={lt}
              onClick={() => setLoadType(lt)}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                loadType === lt ? "border-accent bg-accent-wash text-ink" : "border-hairline text-ink-2"
              }`}
            >
              {lt === "total" ? "total" : "per side / dumbbell"}
            </button>
          ))}
          <button onClick={create} className="ml-auto rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink">
            Add “{query.trim()}”
          </button>
        </div>
      )}
    </div>
  );
}
