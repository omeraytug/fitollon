"""Idempotent writes: re-sending the same day or workout overwrites it instead of duplicating."""

from collections.abc import Iterable

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from fitollon.ingest.health_auto_export import MetricRow, WorkoutRow
from fitollon.models import DailyMetric, Workout


def upsert_metrics(session: Session, rows: Iterable[MetricRow], provider: str) -> int:
    values = [{"day": r.day, "metric": r.metric, "value": r.value, "unit": r.unit, "provider": provider} for r in rows]
    if not values:
        return 0
    stmt = insert(DailyMetric).values(values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["day", "metric", "provider"],
        set_={"value": stmt.excluded.value, "unit": stmt.excluded.unit, "updated_at": func.now()},
    )
    session.execute(stmt)
    return len(values)


def upsert_workouts(session: Session, rows: Iterable[WorkoutRow], provider: str) -> int:
    values = [
        {
            "external_id": r.external_id,
            "name": r.name,
            "start": r.start,
            "end": r.end,
            "duration_s": r.duration_s,
            "active_energy_kcal": r.active_energy_kcal,
            "avg_heart_rate": r.avg_heart_rate,
            "max_heart_rate": r.max_heart_rate,
            "distance_km": r.distance_km,
            "provider": provider,
            "raw": r.raw,
        }
        for r in rows
    ]
    if not values:
        return 0
    stmt = insert(Workout).values(values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["external_id"],
        set_={col: stmt.excluded[col] for col in values[0] if col != "external_id"},
    )
    session.execute(stmt)
    return len(values)
