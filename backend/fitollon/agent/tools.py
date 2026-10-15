"""Tools the AI coach can call to read (and on request, write) your data."""

import re
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from strands import tool

from fitollon.db import get_engine, session_scope
from fitollon.models import DailyMetric, Exercise, Memory, TrainingSession, TrainingSet, Workout

MAX_RANGE_DAYS = 400
MAX_SQL_ROWS = 200


def _dates(start_date: str, end_date: str) -> tuple[date, date]:
    start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    if end < start:
        start, end = end, start
    if (end - start).days > MAX_RANGE_DAYS:
        raise ValueError(f"Range too long (max {MAX_RANGE_DAYS} days); use summarize_metric for long-term trends.")
    return start, end


def _jsonable(value: Any) -> Any:
    if isinstance(value, date | datetime):
        return value.isoformat()
    if isinstance(value, float):
        return round(value, 2)
    return value


@tool
def list_available_metrics() -> list[dict[str, Any]]:
    """List every metric stored in the database with its unit, provider, first/last day and number of days.

    Metric names are kept exactly as the source sends them (Apple Health names like "step_count",
    "dietary_energy", "heart_rate.avg"). Call this when unsure which metric names exist.
    """
    with session_scope() as session:
        rows = session.execute(
            select(
                DailyMetric.metric,
                DailyMetric.provider,
                func.max(DailyMetric.unit),
                func.min(DailyMetric.day),
                func.max(DailyMetric.day),
                func.count(),
            )
            .group_by(DailyMetric.metric, DailyMetric.provider)
            .order_by(DailyMetric.metric)
        ).all()
    return [
        {"metric": m, "provider": p, "unit": u, "first_day": str(first), "last_day": str(last), "days": n}
        for m, p, u, first, last, n in rows
    ]


@tool
def get_daily_metrics(metrics: list[str], start_date: str, end_date: str) -> dict[str, Any]:
    """Get daily values for one or more metrics between two dates (inclusive).

    Args:
        metrics: Metric names exactly as listed by list_available_metrics, e.g. ["step_count", "protein"].
        start_date: First day, YYYY-MM-DD.
        end_date: Last day, YYYY-MM-DD (max 400 days after start_date).
    """
    start, end = _dates(start_date, end_date)
    with session_scope() as session:
        rows = session.execute(
            select(DailyMetric.day, DailyMetric.metric, DailyMetric.provider, DailyMetric.value, DailyMetric.unit)
            .where(DailyMetric.metric.in_(metrics), DailyMetric.day.between(start, end))
            .order_by(DailyMetric.day)
        ).all()

    providers: dict[str, set[str]] = {}
    for _, metric, provider, _, _ in rows:
        providers.setdefault(metric, set()).add(provider)

    def column(metric: str, provider: str) -> str:
        return metric if len(providers[metric]) == 1 else f"{metric} ({provider})"

    units: dict[str, str | None] = {}
    by_day: dict[date, dict[str, float]] = {}
    for day, metric, provider, value, unit in rows:
        col = column(metric, provider)
        units[col] = unit
        by_day.setdefault(day, {})[col] = round(value, 2)

    columns = sorted(units)
    return {
        "columns": ["day", *columns],
        "units": units,
        "rows": [[str(day), *(values.get(c) for c in columns)] for day, values in sorted(by_day.items())],
        "missing_metrics": [m for m in metrics if m not in providers],
    }


@tool
def summarize_metric(
    metric: str, start_date: str, end_date: str, period: Literal["week", "month"] = "week"
) -> list[dict[str, Any]]:
    """Average, min, max and total of one metric per week or month. Use this for long-term trends.

    Args:
        metric: Metric name exactly as listed by list_available_metrics.
        start_date: First day, YYYY-MM-DD.
        end_date: Last day, YYYY-MM-DD.
        period: "week" (weeks start Monday) or "month".
    """
    start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    bucket = func.date_trunc(period, DailyMetric.day).label("bucket")
    with session_scope() as session:
        rows = session.execute(
            select(
                bucket,
                DailyMetric.provider,
                func.avg(DailyMetric.value),
                func.min(DailyMetric.value),
                func.max(DailyMetric.value),
                func.sum(DailyMetric.value),
                func.count(),
            )
            .where(DailyMetric.metric == metric, DailyMetric.day.between(start, end))
            .group_by(bucket, DailyMetric.provider)
            .order_by(bucket)
        ).all()
    return [
        {
            "period_start": b.date().isoformat(),
            "provider": p,
            "avg": round(avg, 2),
            "min": round(lo, 2),
            "max": round(hi, 2),
            "total": round(total, 2),
            "days_with_data": n,
        }
        for b, p, avg, lo, hi, total, n in rows
    ]


@tool
def get_workouts(start_date: str, end_date: str) -> list[dict[str, Any]]:
    """Workouts recorded by Apple Health / Apple Watch (cardio, walks, strength sessions tracked on the watch).

    Args:
        start_date: First day, YYYY-MM-DD.
        end_date: Last day, YYYY-MM-DD.
    """
    start, end = _dates(start_date, end_date)
    with session_scope() as session:
        workouts = session.scalars(
            select(Workout).where(func.date(Workout.start).between(start, end)).order_by(Workout.start)
        ).all()
    return [
        {
            "name": w.name,
            "start": w.start.isoformat(),
            "duration_min": round(w.duration_s / 60, 1) if w.duration_s else None,
            "active_kcal": _jsonable(w.active_energy_kcal),
            "avg_hr": _jsonable(w.avg_heart_rate),
            "max_hr": _jsonable(w.max_heart_rate),
            "distance_km": _jsonable(w.distance_km),
        }
        for w in workouts
    ]


def _format_set(s: TrainingSet) -> str:
    parts = []
    if s.weight_kg is not None:
        parts.append(f"{s.weight_kg:g}kg")
    if s.reps is not None:
        parts.append(f"x{s.reps}")
    if s.duration_s is not None:
        parts.append(f"{s.duration_s:g}s")
    if s.distance_m is not None:
        parts.append(f"{s.distance_m:g}m")
    out = " ".join(parts) or "set"
    if s.rpe is not None:
        out += f" @RPE{s.rpe:g}"
    if s.notes:
        out += f" ({s.notes})"
    return out


def _session_dict(ts: TrainingSession, exercise_filter: str | None = None) -> dict[str, Any]:
    exercises: dict[str, list[str]] = {}
    for s in ts.sets:
        if exercise_filter and exercise_filter.lower() not in s.exercise.name.lower():
            continue
        exercises.setdefault(s.exercise.name, []).append(_format_set(s))
    return {
        "id": ts.id,
        "day": ts.day.isoformat(),
        "title": ts.title,
        "notes": ts.notes,
        "exercises": [{"name": name, "sets": sets} for name, sets in exercises.items()],
    }


@tool
def get_training_sessions(start_date: str, end_date: str, exercise: str | None = None) -> list[dict[str, Any]]:
    """Strength training sessions in a date range, with every set (weight x reps @RPE).

    Args:
        start_date: First day, YYYY-MM-DD.
        end_date: Last day, YYYY-MM-DD.
        exercise: Optional case-insensitive filter on exercise name, e.g. "bench".
    """
    start, end = _dates(start_date, end_date)
    with session_scope() as session:
        sessions = session.scalars(
            select(TrainingSession)
            .where(TrainingSession.day.between(start, end))
            .order_by(TrainingSession.day, TrainingSession.id)
        ).all()
        result = [_session_dict(ts, exercise) for ts in sessions]
    if exercise:
        result = [r for r in result if r["exercises"]]
    return result


@tool
def get_exercise_history(exercise: str, limit_sessions: int = 20) -> dict[str, Any]:
    """Progress history for one exercise: each session's sets, best set and estimated 1RM (Epley formula).

    Args:
        exercise: Exercise name or part of it (case-insensitive), e.g. "squat".
        limit_sessions: How many of the most recent sessions to return.
    """
    with session_scope() as session:
        matches = session.scalars(select(Exercise).where(Exercise.name.ilike(f"%{exercise}%"))).all()
        if not matches:
            names = session.scalars(select(Exercise.name).order_by(Exercise.name)).all()
            return {"error": f"No exercise matching '{exercise}'.", "known_exercises": names}
        ids = [e.id for e in matches]
        sessions = session.scalars(
            select(TrainingSession)
            .where(TrainingSession.sets.any(TrainingSet.exercise_id.in_(ids)))
            .order_by(TrainingSession.day.desc())
            .limit(limit_sessions)
        ).all()
        history = []
        for ts in reversed(sessions):
            sets = [s for s in ts.sets if s.exercise_id in ids]
            best = max(
                (s for s in sets if s.weight_kg and s.reps),
                key=lambda s: s.weight_kg * (1 + s.reps / 30),
                default=None,
            )
            history.append(
                {
                    "day": ts.day.isoformat(),
                    "exercise": sets[0].exercise.name,
                    "sets": [_format_set(s) for s in sets],
                    "best_set": _format_set(best) if best else None,
                    "est_1rm_kg": round(best.weight_kg * (1 + best.reps / 30), 1) if best else None,
                }
            )
    return {"matched_exercises": [e.name for e in matches], "sessions": history}


class SetInput(BaseModel):
    reps: int | None = None
    weight_kg: float | None = None
    rpe: float | None = None
    duration_s: float | None = None
    notes: str | None = None


class ExerciseInput(BaseModel):
    name: str = Field(description="Exercise name, e.g. 'Bench Press'. Reuse existing names when possible.")
    sets: list[SetInput]


@tool
def log_training_session(
    day: str, exercises: list[ExerciseInput], title: str | None = None, notes: str | None = None
) -> dict[str, Any]:
    """Save a strength training session. Only call this when the user asks you to log a workout.

    Args:
        day: Session date, YYYY-MM-DD.
        exercises: Exercises in the order performed, each with its sets.
        title: Optional short title, e.g. "Push day".
        notes: Optional notes about the session.
    """
    with session_scope() as session:
        ts = TrainingSession(day=date.fromisoformat(day), title=title, notes=notes, source="chat")
        position = 0
        for item in exercises:
            item = ExerciseInput.model_validate(item)
            exercise = session.scalars(select(Exercise).where(func.lower(Exercise.name) == item.name.lower())).first()
            if exercise is None:
                exercise = Exercise(name=item.name)
                session.add(exercise)
            for s in item.sets:
                position += 1
                ts.sets.append(TrainingSet(exercise=exercise, position=position, **s.model_dump()))
        session.add(ts)
        session.flush()
        return {"saved_session_id": ts.id, **_session_dict(ts)}


@tool
def remember(fact: str) -> str:
    """Save a lasting fact about the user (preference, injury, schedule, goal change) for future conversations.

    Args:
        fact: One self-contained sentence, e.g. "Has a left shoulder impingement; avoids overhead pressing."
    """
    with session_scope() as session:
        memory = Memory(content=fact)
        session.add(memory)
        session.flush()
        return f"Saved memory #{memory.id}."


@tool
def forget(memory_id: int) -> str:
    """Delete a saved memory that is wrong or outdated.

    Args:
        memory_id: The id shown next to the memory.
    """
    with session_scope() as session:
        memory = session.get(Memory, memory_id)
        if memory is None:
            return f"No memory #{memory_id}."
        session.delete(memory)
        return f"Deleted memory #{memory_id}."


@tool
def run_sql(query: str) -> dict[str, Any]:
    """Run one read-only PostgreSQL SELECT for analysis the other tools don't cover. Returns at most 200 rows.

    Tables: daily_metrics(day, metric, value, unit, provider), workouts(name, start, "end", duration_s,
    active_energy_kcal, avg_heart_rate, max_heart_rate, distance_km), training_sessions(id, day, title, notes),
    training_sets(session_id, exercise_id, position, reps, weight_kg, rpe, duration_s, distance_m, notes),
    exercises(id, name, muscle_group).

    Args:
        query: A single SELECT (or WITH ... SELECT) statement.
    """
    statement = query.strip().rstrip(";")
    if ";" in statement:
        return {"error": "Only a single statement is allowed."}
    if not re.match(r"^\s*(select|with)\b", statement, re.IGNORECASE):
        return {"error": "Only SELECT queries are allowed."}
    with get_engine().connect() as conn:
        try:
            conn.execute(text("SET TRANSACTION READ ONLY"))
            conn.execute(text("SET LOCAL statement_timeout = 5000"))
            result = conn.execute(text(statement))
            rows = result.fetchmany(MAX_SQL_ROWS + 1)
            columns = list(result.keys())
        except Exception as exc:  # report SQL errors back to the model so it can fix the query
            return {"error": str(exc).splitlines()[0]}
        finally:
            conn.rollback()
    return {
        "columns": columns,
        "rows": [[_jsonable(v) for v in row] for row in rows[:MAX_SQL_ROWS]],
        "truncated": len(rows) > MAX_SQL_ROWS,
    }


ALL_TOOLS = [
    list_available_metrics,
    get_daily_metrics,
    summarize_metric,
    get_workouts,
    get_training_sessions,
    get_exercise_history,
    log_training_session,
    remember,
    forget,
    run_sql,
]
