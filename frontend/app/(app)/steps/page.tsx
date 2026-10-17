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
import { stepDays, stepsPerDay } from "@/lib/averages";
import { formatNumber, shortDay } from "@/lib/format";

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

/** "Oct 12 – Oct 16"; years appear when the range isn't all in the current year. */
function span(first: string, last: string, today: string): string {
  const year = first.slice(0, 4) !== today.slice(0, 4) || last.slice(0, 4) !== today.slice(0, 4);
  return first === last ? shortDay(first, year) : `${shortDay(first, year)} – ${shortDay(last, year)}`;
}

function Content({ data }: { data: SeriesResponse }) {
  const points = data.series.steps?.points ?? [];
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const days = stepDays(points, data.start, data.end); // the same rule as Home's 7-day average
  const avg = stepsPerDay(points, data.start, data.end);
  const covers =
    data.end >= data.today
      ? `${shortDay(data.start, data.start.slice(0, 4) !== data.today.slice(0, 4))} – today`
      : span(data.start, data.end, data.today);
  const weekly = isWeekly(data);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Stat i={1} label="Daily average" value={avg !== null ? formatNumber(avg, 0) : "—"} detail={covers} />
        <Stat i={2} label="Total" value={formatNumber(total, 0)} detail={covers} />
      </div>
      <ChartCard i={3}>
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
            // The Daily average above as a line; hovering a bar shows only its steps.
            ...(avg !== null && days.length > 1
              ? [
                  {
                    key: "avg",
                    label: "Daily average",
                    color: "var(--ink-2)",
                    kind: "line" as const,
                    dashed: true,
                    drawnOnly: true,
                    points: days.map((day) => ({ day, value: avg })),
                  },
                ]
              : []),
          ]}
        />
      </ChartCard>
    </>
  );
}
