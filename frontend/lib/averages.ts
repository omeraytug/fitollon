// The two ways Fitollon averages a range, shared by Home and the history pages so their numbers always agree.
import { addDays, daysBetween, mean, type Point } from "@/lib/format";

/** The days a steps average covers: from the first day with data (or the range start, if later) to the end. */
export function stepDays(points: Point[], start: string, end: string): string[] {
  const inRange = points.filter((p) => p.day >= start && p.day <= end);
  if (!inRange.length) return [];
  const first = inRange.reduce((day, p) => (p.day < day ? p.day : day), end);
  return Array.from({ length: daysBetween(first, end) + 1 }, (_, n) => addDays(first, n));
}

/**
 * Steps per day: every day counts, today and days without data as 0 (as Apple Health averages steps), but not the
 * days before the step history begins, so a long range isn't divided by days that predate the data.
 */
export function stepsPerDay(points: Point[], start: string, end: string): number | null {
  const days = stepDays(points, start, end);
  if (!days.length) return null;
  const total = points.filter((p) => p.day >= start && p.day <= end).reduce((sum, p) => sum + p.value, 0);
  return total / days.length;
}

/** Food per logged day: today's log is still open and a day without a log isn't a day of eating nothing. */
export function perLoggedDay(points: Point[], start: string, end: string, today: string): number | null {
  return mean(points.filter((p) => p.day >= start && p.day <= end && p.day < today).map((p) => p.value));
}
