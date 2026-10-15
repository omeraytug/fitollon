export type Point = { day: string; value: number };

export function displayUnit(unit: string | null): string {
  if (!unit || unit === "count") return "";
  if (unit === "hr") return "h";
  return unit;
}

/** 1 decimal below 100 (84.4 kg), none above (2,154 kcal, 13,132 steps). */
export function formatNumber(value: number, digits?: number): string {
  const d = digits ?? (Math.abs(value) >= 100 ? 0 : 1);
  return value.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
}

export function formatValue(value: number, unit: string | null, digits?: number): string {
  const suffix = displayUnit(unit);
  return suffix ? `${formatNumber(value, digits)} ${suffix}` : formatNumber(value, digits);
}

/** Signed difference, e.g. "−0.3" or "+120", with a real minus sign. */
export function formatDelta(value: number, digits?: number): string {
  const text = formatNumber(Math.abs(value), digits);
  if (Number(text.replace(/,/g, "")) === 0) return text;
  return `${value < 0 ? "−" : "+"}${text}`;
}

function utc(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: string, days: number): string {
  const date = utc(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
}

/** "Oct 13", or "Oct 13, 2025" outside the current year. */
export function shortDay(day: string, withYear = false): string {
  return utc(day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

/** "Today", "Yesterday", or a short date. */
export function formatDay(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return shortDay(day, day.slice(0, 4) !== today.slice(0, 4));
}

export function longDate(day: string): string {
  return utc(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
