"use client";

import {
  ChartCard,
  HistoryHeader,
  HistorySkeleton,
  Stat,
  isWeekly,
  useRange,
  useSeries,
  type SeriesResponse,
} from "@/components/history";
import { TimeChart } from "@/components/time-chart";
import { addDays, formatDay, formatNumber, mean, type Point } from "@/lib/format";

export default function StepsPage() {
  const [range, setRange] = useRange("steps", 30);
  const { data, error } = useSeries(["steps"], range);

  return (
    <div className="flex flex-col gap-4">
      <HistoryHeader title="Steps" range={range} onRange={setRange} />
      {error && <p className="text-critical">{error}</p>}
      {!data ? !error && <HistorySkeleton /> : <Content key={`${data.start}:${data.end}`} data={data} />}
    </div>
  );
}

/** Average of the 7 days ending on each full day (days without data are skipped, not counted as zero). */
function rollingWeek(points: Point[], today: string): Point[] {
  const byDay = new Map(points.map((p) => [p.day, p.value]));
  return points
    .filter((p) => p.day < today)
    .map((p) => {
      const window = Array.from({ length: 7 }, (_, i) => byDay.get(addDays(p.day, -i))).filter(
        (v): v is number => v !== undefined,
      );
      return { day: p.day, value: mean(window)! };
    });
}

function Content({ data }: { data: SeriesResponse }) {
  const points = data.series.steps?.points ?? [];
  const full = points.filter((p) => p.day < data.today);
  const best = full.reduce<Point | null>((top, p) => (!top || p.value > top.value ? p : top), null);
  const avg = mean(full.map((p) => p.value));
  const weekly = isWeekly(data);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat i={1} label="Daily average" value={avg !== null ? formatNumber(avg, 0) : "—"} detail="full days" />
        <Stat
          i={2}
          label="Best day"
          value={best ? formatNumber(best.value, 0) : "—"}
          detail={best ? formatDay(best.day, data.today) : undefined}
        />
        <Stat
          i={3}
          label="Total"
          value={formatNumber(
            points.reduce((sum, p) => sum + p.value, 0),
            0,
          )}
          detail="in this range"
        />
      </div>
      <ChartCard i={4}>
        <TimeChart
          label="Steps per day"
          start={data.start}
          end={data.end}
          unit="steps"
          digits={0}
          zeroBased
          weekly={weekly}
          partialDay={data.today}
          series={[
            { key: "steps", label: weekly ? "Steps (weekly average)" : "Steps", color: "var(--series-1)", kind: "bars", points },
            ...(weekly
              ? []
              : [
                  {
                    key: "avg",
                    label: "7-day average",
                    color: "var(--ink-2)",
                    kind: "line" as const,
                    points: rollingWeek(points, data.today),
                  },
                ]),
          ]}
        />
      </ChartCard>
    </>
  );
}
