import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { addDays, shortDay, type Point } from "@/lib/format";

const DAYS = 30;

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

/** Monday of the day's week. */
function weekStart(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

/** One habit as a 30-day grid (oldest top left, today bottom right) and how many days of this week it happened. */
function HabitCard({
  title,
  href,
  color,
  logged,
  today,
  i,
}: {
  title: string;
  href: string;
  color: string;
  logged: Set<string>;
  today: string;
  i: number;
}) {
  const days = Array.from({ length: DAYS }, (_, n) => addDays(today, n - DAYS + 1));
  const monday = weekStart(today);
  const thisWeek = days.filter((day) => day >= monday && logged.has(day)).length;
  const total = days.filter((day) => logged.has(day)).length;

  return (
    <Link
      href={href}
      style={stagger(i)}
      className="rise press group flex flex-col rounded-2xl border border-hairline bg-surface p-4 hover:border-accent/40"
    >
      <p className="font-medium">{title}</p>
      <p className="text-xs text-muted">Last 30 days</p>
      <div
        role="img"
        aria-label={`${title}: ${total} of the last 30 days, ${thisWeek} of 7 this week`}
        className="mt-3 grid w-full max-w-72 auto-cols-fr grid-flow-col grid-rows-3 gap-[3px] sm:gap-1"
      >
        {days.map((day, n) => {
          const done = logged.has(day);
          return (
            <span
              key={day}
              title={shortDay(day)}
              className={`aspect-square rounded-[3px] sm:rounded-[4px] ${done ? "pop" : "bg-grid"} ${
                day === today && !done ? "ring-1 ring-muted/60 ring-inset" : ""
              }`}
              style={done ? { backgroundColor: color, animationDelay: `${200 + n * 12}ms` } : undefined}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5 border-t border-hairline pt-3">
        <span className="text-xl font-semibold tabular-nums">{thisWeek}/7</span>
        <span className="text-sm text-ink-2">this week</span>
        <ChevronRight size={16} className="ml-auto self-center text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

/** Days you weighed in and logged food, from what MacroFactor writes to Apple Health. */
export function Habits({
  today,
  weighIns,
  calories,
  i,
}: {
  today: string;
  weighIns: Point[];
  calories: Point[];
  i: number;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="rise text-lg font-semibold" style={stagger(i)}>
        Habits
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <HabitCard
          title="Weigh-in"
          href="/weight"
          color="var(--series-3)"
          logged={new Set(weighIns.map((p) => p.day))}
          today={today}
          i={i + 1}
        />
        <HabitCard
          title="Food logging"
          href="/nutrition"
          color="var(--series-1)"
          logged={new Set(calories.filter((p) => p.value > 0).map((p) => p.day))}
          today={today}
          i={i + 2}
        />
      </div>
    </section>
  );
}
