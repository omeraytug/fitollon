"""Parse Health Auto Export (iOS app) JSON payloads, Export Version 2.

Format reference: https://help.healthyapps.dev/en/health-auto-export/export-format

    {"data": {"metrics": [{"name": "step_count", "units": "count",
                           "data": [{"date": "2024-02-06 00:00:00 -0800", "qty": 8500, "source": "..."}]}],
              "workouts": [{"id": "...", "name": "Running", "start": "...", "end": "...", "duration": 1800,
                            "activeEnergyBurned": {"qty": 350, "units": "kcal"}, ...}]}}

Recommended automation settings: JSON, "Summarize Data" on, aggregated by day. If data arrives
unsummarized, points are rolled up per day here (summed for cumulative metrics, averaged otherwise).
"""

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

PROVIDER = "apple_health"

# Metrics where several points in one day add up to the daily total.
CUMULATIVE_METRICS = {
    "step_count",
    "active_energy",
    "basal_energy_burned",
    "walking_running_distance",
    "cycling_distance",
    "swimming_distance",
    "flights_climbed",
    "apple_exercise_time",
    "apple_stand_time",
    "apple_stand_hour",
    "mindful_minutes",
    "protein",
    "carbohydrates",
    "total_fat",
    "saturated_fat",
    "monounsaturated_fat",
    "polyunsaturated_fat",
    "fiber",
    "cholesterol",
    "sodium",
    "potassium",
    "caffeine",
}

# Units depend on the phone's settings; store one unit per quantity so sources can be compared and averaged.
UNIT_CONVERSIONS: dict[str, tuple[float, str]] = {
    "kj": (1 / 4.184, "kcal"),
    "count/min": (1.0, "bpm"),
}

# Large time-series arrays we don't keep in the stored workout summary.
WORKOUT_ARRAY_KEYS = {"heartRateData", "heartRateRecovery", "route", "stepCount", "walkingAndRunningDistance"}


@dataclass(frozen=True)
class MetricRow:
    day: date
    metric: str
    value: float
    unit: str | None


@dataclass(frozen=True)
class WorkoutRow:
    external_id: str
    name: str
    start: datetime
    end: datetime | None
    duration_s: float | None
    active_energy_kcal: float | None
    avg_heart_rate: float | None
    max_heart_rate: float | None
    distance_km: float | None
    raw: dict[str, Any]


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def _is_cumulative(metric: str) -> bool:
    return metric in CUMULATIVE_METRICS or metric.startswith("dietary_")


def parse_day(value: str) -> date:
    # "2024-02-06 14:30:00 -0800" or "2024-02-06": the date part is already the phone's local date.
    return date.fromisoformat(value[:10])


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S %z")
    except ValueError:
        return datetime.fromisoformat(value)


def parse_metrics(metrics: list[dict[str, Any]]) -> list[MetricRow]:
    values: dict[tuple[date, str], list[float]] = defaultdict(list)
    units: dict[str, str | None] = {}

    for metric in metrics:
        name = metric.get("name")
        if not name:
            continue
        factor, unit = UNIT_CONVERSIONS.get((metric.get("units") or "").lower(), (1.0, metric.get("units")))
        for point in metric.get("data") or []:
            raw_date = point.get("date") or point.get("startDate")
            if not raw_date:
                continue
            day = parse_day(raw_date)
            if isinstance(point.get("qty"), int | float):
                values[(day, name)].append(float(point["qty"]) * factor)
                units[name] = unit
                continue
            # Multi-value points: heart_rate {Min, Avg, Max}, sleep_analysis {totalSleep, deep, ...},
            # blood_pressure {systolic, diastolic}. Each numeric field becomes its own metric.
            for field, field_value in point.items():
                if isinstance(field_value, bool) or not isinstance(field_value, int | float):
                    continue
                sub_metric = f"{name}.{_snake(field)}"
                values[(day, sub_metric)].append(float(field_value) * factor)
                units[sub_metric] = unit

    rows = []
    for (day, metric), points in values.items():
        base = metric.split(".", 1)[0]
        value = sum(points) if _is_cumulative(base) else sum(points) / len(points)
        rows.append(MetricRow(day=day, metric=metric, value=round(value, 4), unit=units.get(metric)))
    return rows


def _qty(obj: Any, *, kcal: bool = False, km: bool = False) -> float | None:
    """Read a {"qty": .., "units": ..} measurement, converting units where we normalize."""
    if isinstance(obj, int | float):
        return float(obj)
    if not isinstance(obj, dict) or not isinstance(obj.get("qty"), int | float):
        return None
    value, unit = float(obj["qty"]), (obj.get("units") or "").lower()
    if kcal and unit == "kj":
        return value / 4.184
    if km:
        if unit == "mi":
            return value * 1.609344
        if unit == "m":
            return value / 1000
    return value


def parse_workouts(workouts: list[dict[str, Any]]) -> list[WorkoutRow]:
    rows = []
    for workout in workouts:
        start = parse_datetime(workout.get("start"))
        if start is None:
            continue
        external_id = workout.get("id") or f"{workout.get('name')}-{workout.get('start')}"
        heart_rate = workout.get("heartRate") or {}
        rows.append(
            WorkoutRow(
                external_id=str(external_id),
                name=workout.get("name") or "Workout",
                start=start,
                end=parse_datetime(workout.get("end")),
                duration_s=_qty(workout.get("duration")),
                active_energy_kcal=_qty(workout.get("activeEnergyBurned") or workout.get("activeEnergy"), kcal=True),
                avg_heart_rate=_qty(heart_rate.get("avg")) or _qty(workout.get("avgHeartRate")),
                max_heart_rate=_qty(heart_rate.get("max")) or _qty(workout.get("maxHeartRate")),
                distance_km=_qty(workout.get("distance"), km=True),
                raw={k: v for k, v in workout.items() if k not in WORKOUT_ARRAY_KEYS},
            )
        )
    return rows


def parse_payload(payload: dict[str, Any]) -> tuple[list[MetricRow], list[WorkoutRow]]:
    data = payload.get("data", payload)
    return parse_metrics(data.get("metrics") or []), parse_workouts(data.get("workouts") or [])
