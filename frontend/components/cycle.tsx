"use client";

import { Check, ChevronRight, Minus, Play } from "lucide-react";
import Link from "next/link";

import { shortDate, type Cycle, type CycleSlot } from "@/lib/training";

export function cycleDates(cycle: Cycle): string | null {
  if (!cycle.first_day || !cycle.last_day) return null;
  if (cycle.first_day === cycle.last_day) return shortDate(cycle.first_day);
  return `${shortDate(cycle.first_day)} – ${shortDate(cycle.last_day)}`;
}

export function cycleProgress(cycle: Cycle): { done: number; total: number } {
  return { done: cycle.slots.filter((s) => s.status === "done").length, total: cycle.slots.length };
}

function Marker({ status }: { status: CycleSlot["status"] }) {
  if (status === "done") {
    return (
      <span className="pop grid size-8 place-items-center rounded-full bg-accent text-accent-ink">
        <Check size={16} strokeWidth={3} />
      </span>
    );
  }
  if (status === "next") {
    return (
      <span className="pulse grid size-8 place-items-center rounded-full border-2 border-accent bg-accent-wash text-accent">
        <Play size={13} fill="currentColor" />
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="grid size-8 place-items-center rounded-full border border-dashed border-muted text-muted">
        <Minus size={14} />
      </span>
    );
  }
  return <span className="size-8 rounded-full border-2 border-grid bg-surface" />;
}

/** The cycle as a vertical timeline in program order; the next session gets a Start button. */
export function CycleTimeline({ cycle, onStart }: { cycle: Cycle; onStart?: (templateId: number) => void }) {
  return (
    <ol className="flex flex-col">
      {cycle.slots.map((slot, i) => {
        const last = i === cycle.slots.length - 1;
        const following = cycle.slots[i + 1]?.status;
        const doneToNext = slot.status === "done" && (following === "done" || following === "next");
        const row = (
          <>
            <span className="relative flex flex-col items-center self-stretch">
              <Marker status={slot.status} />
              {!last && <span className={`w-0.5 flex-1 ${doneToNext ? "bg-accent" : "bg-grid"}`} />}
            </span>
            <span className={`flex min-w-0 flex-1 items-center gap-3 pb-5 ${last ? "pb-0" : ""}`}>
              <span className="min-w-0 flex-1 pt-1">
                <span
                  className={`block font-medium ${slot.status === "skipped" ? "text-muted" : slot.status === "upcoming" ? "text-ink-2" : ""}`}
                >
                  {slot.name}
                </span>
                <span className="block text-sm text-muted">
                  {slot.session
                    ? `${shortDate(slot.session.day)} · ${slot.session.set_count} sets`
                    : slot.status === "next"
                      ? "Next up"
                      : slot.status === "skipped"
                        ? "Skipped"
                        : "Later this cycle"}
                </span>
              </span>
              {slot.session && <ChevronRight size={18} className="text-muted transition-transform group-hover:translate-x-0.5" />}
            </span>
          </>
        );
        return (
          <li key={slot.template_id} className="rise" style={{ "--i": i + 1 } as React.CSSProperties}>
            {slot.session ? (
              <Link href={`/training/${slot.session.id}`} className="group flex gap-3 rounded-xl hover:text-accent">
                {row}
              </Link>
            ) : (
              <div className="flex gap-3">
                {row}
                {slot.status === "next" && onStart && (
                  <button
                    onClick={() => onStart(slot.template_id)}
                    className="press mt-0.5 flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full bg-accent px-4 text-sm font-medium text-accent-ink"
                  >
                    <Play size={13} fill="currentColor" />
                    Start
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** One earlier cycle on a single line of chips. */
export function CompactCycle({ cycle }: { cycle: Cycle }) {
  const { done, total } = cycleProgress(cycle);
  return (
    <div className="py-3">
      <p className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">Cycle {cycle.number}</span>
        <span className="text-muted">
          {cycleDates(cycle)} · {done}/{total}
        </span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {cycle.slots.map((slot) =>
          slot.session ? (
            <Link
              key={slot.template_id}
              href={`/training/${slot.session.id}`}
              className="press inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-3 py-1 text-sm hover:text-accent"
            >
              <Check size={13} strokeWidth={3} className="text-accent" />
              {slot.name}
              <span className="text-xs text-muted">{shortDate(slot.session.day).split(" ")[0]}</span>
            </Link>
          ) : (
            <span
              key={slot.template_id}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-hairline px-3 py-1 text-sm text-muted"
            >
              {slot.name}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

