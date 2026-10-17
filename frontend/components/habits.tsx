import { addDays, shortDay } from "@/lib/format";

const WEEKS = 5;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

/** Monday of the day's week. */
function weekStart(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

/** Consecutive logged days up to today; today is still open, so a run that reached yesterday still counts. */
function streak(logged: Set<string>, today: string, first: string): string {
  let day = logged.has(today) ? today : addDays(today, -1);
  let days = 0;
  while (day >= first && logged.has(day)) {
    days += 1;
    day = addDays(day, -1);
  }
  if (days === 0) return "No streak";
  return `${days}${day < first ? "+" : ""}-day streak`; // "+" when the run goes back past the calendar
}

/** One habit as a calendar of the last five weeks (a row per week, Monday first), with this week's count and the streak. */
function HabitCard({ title, color, logged, today, i }: { title: string; color: string; logged: Set<string>; today: string; i: number }) {
  const first = addDays(weekStart(today), -7 * (WEEKS - 1));
  const days = Array.from({ length: WEEKS * 7 }, (_, n) => addDays(first, n));
  const monday = weekStart(today);
  const thisWeek = days.filter((day) => day >= monday && day <= today && logged.has(day)).length;
  const total = days.filter((day) => day <= today && logged.has(day)).length;
  const run = streak(logged, today, first);

  const count = (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xl font-semibold tabular-nums lg:text-3xl">{thisWeek}/7</span>
      <span className="text-sm text-ink-2">this week</span>
    </span>
  );

  // Stacked and centered on phones; on wide screens the text sits left of a larger calendar.
  return (
    <div
      style={stagger(i)}
      className="rise flex flex-col items-center rounded-2xl border border-hairline bg-surface p-4 text-center lg:flex-row lg:items-stretch lg:justify-between lg:gap-6 lg:p-6 lg:text-left"
    >
      <div className="flex flex-col items-center lg:items-start lg:justify-between">
        <div>
          <p className="font-medium lg:text-lg">{title}</p>
          <p className="text-xs text-muted">Last 5 weeks</p>
        </div>
        <div className="hidden lg:block">
          {count}
          <p className="mt-1 text-sm text-muted">{run}</p>
        </div>
      </div>
      <div
        role="img"
        aria-label={`${title}: ${total} days in the last 5 weeks, ${thisWeek} of 7 this week, ${run.toLowerCase()}`}
        className="mt-3 grid w-full max-w-52 grid-cols-7 gap-[3px] sm:gap-1 lg:mt-0 lg:w-60 lg:max-w-none lg:gap-1.5"
      >
        {WEEKDAYS.map((letter, n) => (
          <span key={n} aria-hidden className="pb-0.5 text-center text-[10px] leading-none text-muted">
            {letter}
          </span>
        ))}
        {days.map((day, n) => {
          const done = logged.has(day);
          const future = day > today;
          return (
            <span
              key={day}
              title={future ? undefined : shortDay(day)}
              className={`aspect-square rounded-[3px] sm:rounded-[4px] lg:rounded-md ${
                done ? "pop" : future ? "border border-dashed border-grid" : "bg-grid"
              } ${day === today && !done ? "ring-1 ring-muted/60 ring-inset" : ""}`}
              style={done ? { backgroundColor: color, animationDelay: `${200 + n * 12}ms` } : undefined}
            />
          );
        })}
      </div>
      <div className="mt-3 flex w-full flex-col items-center border-t border-hairline pt-3 lg:hidden">
        {count}
        <p className="mt-0.5 text-xs text-muted">{run}</p>
      </div>
    </div>
  );
}

/** Days you weighed in and logged food, from what MacroFactor writes to Apple Health. */
export function Habits({ today, weighIns, foodLogs, i }: { today: string; weighIns: string[]; foodLogs: string[]; i: number }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="rise text-lg font-semibold" style={stagger(i)}>
        Habits
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <HabitCard
          title="Weigh-in"
          color="var(--series-3)"
          logged={new Set(weighIns)}
          today={today}
          i={i + 1}
        />
        <HabitCard
          title="Food logging"
          color="var(--series-1)"
          logged={new Set(foodLogs)}
          today={today}
          i={i + 2}
        />
      </div>
    </section>
  );
}
