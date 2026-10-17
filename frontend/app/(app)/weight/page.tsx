"use client";

import {
  ChartCard,
  HistoryHeader,
  HistorySkeleton,
  Stat,
  useRange,
  useSeries,
  type SeriesResponse,
} from "@/components/history";
import { TimeChart } from "@/components/time-chart";
import { daysBetween, formatDay, formatDelta, formatNumber, shortDay } from "@/lib/format";

const KEYS = ["weight", "weight_trend"];

export default function WeightPage() {
  const [range, setRange] = useRange("weight", 90);
  const { data, error } = useSeries(KEYS, range);

  return (
    <div className="flex flex-col gap-4">
      <HistoryHeader title="Weight" range={range} onRange={setRange} />
      {error && <p className="text-critical">{error}</p>}
      {!data ? (
        !error && <HistorySkeleton />
      ) : (
        <Content key={`${data.start}:${data.end}`} data={data} />
      )}
    </div>
  );
}

function Content({ data }: { data: SeriesResponse }) {
  const scale = data.series.weight?.points ?? [];
  const trend = data.series.weight_trend?.points ?? [];
  const start = data.start;
  const first = trend[0];
  const last = trend[trend.length - 1];
  const change = first && last ? last.value - first.value : null;
  const span = first && last ? daysBetween(first.day, last.day) : 0;
  // A week of days spans 6 days from first to last, so 7D gets a rate too.
  const rate = change !== null && span >= 6 ? (change / span) * 7 : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          i={1}
          label="Trend weight"
          value={last ? `${formatNumber(last.value, 1)} kg` : "—"}
          detail={last ? formatDay(last.day, data.today) : undefined}
        />
        <Stat
          i={2}
          label="Change"
          value={change !== null ? `${formatDelta(change, 1)} kg` : "—"}
          detail={first ? `since ${shortDay(first.day, first.day.slice(0, 4) !== data.today.slice(0, 4))}` : undefined}
        />
        <Stat
          i={3}
          label="Rate"
          value={rate !== null ? `${formatDelta(rate, 2)} kg/wk` : "—"}
          detail={rate !== null && last ? `${formatDelta((rate / last.value) * 100, 2)}% of body weight` : undefined}
        />
        <Stat
          i={4}
          label="Weigh-ins"
          value={String(scale.length)}
          detail={`of ${daysBetween(start, data.end) + 1} days`}
        />
      </div>
      <ChartCard i={5}>
        <TimeChart
          label="Scale weight and trend weight"
          start={start}
          end={data.end}
          unit="kg"
          digits={1}
          series={[
            { key: "weight", label: "Scale weight", color: "var(--muted)", kind: "dots", points: scale },
            { key: "weight_trend", label: "Trend weight", color: "var(--series-1)", kind: "line", points: trend },
          ]}
        />
      </ChartCard>
    </>
  );
}
