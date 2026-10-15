"use client";

import {
  ChartCard,
  HistoryHeader,
  HistorySkeleton,
  Stat,
  fullDays,
  isWeekly,
  useRange,
  useSeries,
  type SeriesResponse,
} from "@/components/history";
import { TimeChart } from "@/components/time-chart";
import { formatDelta, formatNumber, mean, type Point } from "@/lib/format";

const KEYS = ["calories", "expenditure", "protein", "carbs", "fat"];
const KCAL_PER_KG = 7700;
const MACROS = [
  { key: "protein", label: "Protein", color: "var(--series-3)" },
  { key: "carbs", label: "Carbs", color: "var(--series-4)" },
  { key: "fat", label: "Fat", color: "var(--series-5)" },
] as const;

export default function NutritionPage() {
  const [range, setRange] = useRange("nutrition", 30);
  const { data, error } = useSeries(KEYS, range);

  return (
    <div className="flex flex-col gap-4">
      <HistoryHeader title="Nutrition" range={range} onRange={setRange} />
      {error && <p className="text-critical">{error}</p>}
      {!data ? !error && <HistorySkeleton /> : <Content key={`${data.start}:${data.end}`} data={data} />}
    </div>
  );
}

function Content({ data }: { data: SeriesResponse }) {
  const points = (key: string) => data.series[key]?.points ?? [];
  const done = (key: string) => points(key).filter((p) => p.day < data.today); // today's log is still open
  const start = data.start;
  const weekly = isWeekly(data);

  const goal = (field: "calories" | "protein" | "carbs" | "fat"): Point[] =>
    (data.targets ?? []).flatMap((t) => (t[field] === null ? [] : [{ day: t.day, value: t[field]! }]));
  const goalOn = new Map(goal("calories").map((p) => [p.day, p.value]));
  const eaten = done("calories");
  const burned = new Map(points("expenditure").map((p) => [p.day, p.value]));
  const balances = eaten.flatMap((p) => (burned.has(p.day) ? [p.value - burned.get(p.day)!] : []));
  const balance = mean(balances);
  const avgEaten = mean(eaten.map((p) => p.value));
  const avgGoal = mean(eaten.flatMap((p) => (goalOn.has(p.day) ? [goalOn.get(p.day)!] : [])));
  const avgBurned = mean(points("expenditure").map((p) => p.value));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          i={1}
          label="Avg eaten"
          value={avgEaten !== null ? `${formatNumber(avgEaten, 0)} kcal` : "—"}
          detail={avgGoal !== null ? `goal ${formatNumber(avgGoal, 0)} kcal` : "per logged day"}
        />
        <Stat
          i={2}
          label="Avg expenditure"
          value={avgBurned !== null ? `${formatNumber(avgBurned, 0)} kcal` : "—"}
          detail="per day"
        />
        <Stat
          i={3}
          label="Avg balance"
          value={balance !== null ? `${formatDelta(balance, 0)} kcal` : "—"}
          detail={balance !== null ? `≈ ${formatDelta((balance * 7) / KCAL_PER_KG, 2)} kg/week` : undefined}
        />
        <Stat
          i={4}
          label="Logged days"
          value={String(eaten.length)}
          detail={`of ${fullDays(data)} full days`}
        />
      </div>

      <ChartCard i={5} title="Calories eaten vs expenditure">
        <TimeChart
          label="Calories eaten per day and energy expenditure"
          start={start}
          end={data.end}
          unit="kcal"
          digits={0}
          zeroBased
          weekly={weekly}
          partialDay={data.today}
          series={[
            { key: "calories", label: "Calories eaten", color: "var(--series-1)", kind: "bars", points: points("calories") },
            { key: "expenditure", label: "Expenditure", color: "var(--series-2)", kind: "line", points: points("expenditure") },
            ...(goalOn.size
              ? [{ key: "goal", label: "Calorie goal", color: "var(--ink-2)", kind: "line" as const, dashed: true, points: goal("calories") }]
              : []),
          ]}
        />
      </ChartCard>

      <div className="grid gap-3 sm:grid-cols-3">
        {MACROS.map((m, n) => {
          const avg = mean(done(m.key).map((p) => p.value));
          return (
            <ChartCard key={m.key} i={6 + n}>
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className="flex items-center gap-2 font-medium">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                  {m.label}
                </h2>
                {avg !== null && <span className="text-sm text-ink-2 tabular-nums">avg {formatNumber(avg, 0)} g</span>}
              </div>
              <TimeChart
                label={`${m.label} per day`}
                start={start}
                end={data.end}
                unit="g"
                digits={0}
                height={140}
                zeroBased
                weekly={weekly}
                partialDay={data.today}
                series={[
                  { key: m.key, label: m.label, color: m.color, kind: "bars", points: points(m.key) },
                  ...(goal(m.key).length
                    ? [{ key: "goal", label: "Goal", color: "var(--ink-2)", kind: "line" as const, dashed: true, points: goal(m.key) }]
                    : []),
                ]}
              />
            </ChartCard>
          );
        })}
      </div>
    </>
  );
}
