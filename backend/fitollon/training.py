"""Training log helpers shared by the API and the AI coach's tools."""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from fitollon.models import Exercise, TrainingSession, TrainingSet, WorkoutTemplate

LOAD_TYPES = ("total", "per_side")


def format_set(s: TrainingSet) -> str:
    """Compact text for one set, e.g. "40kg/side x8 @RIR1 (slow eccentric)"."""
    parts = []
    if s.weight_kg is not None:
        parts.append(f"{s.weight_kg:g}kg" + ("/side" if s.exercise.load_type == "per_side" else ""))
    if s.reps is not None:
        parts.append(f"x{s.reps}")
    if s.duration_s is not None:
        parts.append(f"{s.duration_s:g}s")
    if s.distance_m is not None:
        parts.append(f"{s.distance_m:g}m")
    out = " ".join(parts) or "set"
    if s.rir is not None:
        out += f" @RIR{s.rir:g}"
    elif s.rpe is not None:
        out += f" @RPE{s.rpe:g}"
    if s.notes:
        out += f" ({s.notes})"
    return out


def rep_range(rep_min: int | None, rep_max: int | None) -> str | None:
    if rep_min and rep_max and rep_min != rep_max:
        return f"{rep_min}-{rep_max}"
    value = rep_min or rep_max
    return str(value) if value else None


def get_or_create_exercise(session: Session, name: str, load_type: str | None = None) -> Exercise:
    name = " ".join(name.split())
    exercise = session.scalars(select(Exercise).where(func.lower(Exercise.name) == name.lower())).first()
    if exercise is None:
        exercise = Exercise(name=name, load_type=load_type if load_type in LOAD_TYPES else "total")
        session.add(exercise)
        session.flush()
    return exercise


def program(session: Session) -> list[WorkoutTemplate]:
    return list(session.scalars(select(WorkoutTemplate).order_by(WorkoutTemplate.position, WorkoutTemplate.id)))


def next_template(session: Session) -> WorkoutTemplate | None:
    """The template after the most recently trained one, wrapping around the cycle."""
    templates = program(session)
    if not templates:
        return None
    last = session.scalars(
        select(TrainingSession)
        .where(TrainingSession.template_id.is_not(None))
        .order_by(TrainingSession.day.desc(), TrainingSession.id.desc())
        .limit(1)
    ).first()
    ids = [t.id for t in templates]
    if last is None or last.template_id not in ids:
        return templates[0]
    return templates[(ids.index(last.template_id) + 1) % len(templates)]


def last_performance(
    session: Session, exercise_ids: list[int], exclude_session_id: int | None = None
) -> dict[int, dict[str, Any]]:
    """For each exercise, the sets from the most recent other session that included it.

    If the exercise was last swapped out for another one, those sets are returned with "substituted_by" set,
    so the user sees what they did in its place.
    """
    result: dict[int, dict[str, Any]] = {}
    for exercise_id in set(exercise_ids):
        in_slot = (TrainingSet.exercise_id == exercise_id) | (TrainingSet.planned_exercise_id == exercise_id)
        query = (
            select(TrainingSession)
            .where(TrainingSession.sets.any(in_slot))
            .order_by(TrainingSession.day.desc(), TrainingSession.id.desc())
            .limit(1)
        )
        if exclude_session_id is not None:
            query = query.where(TrainingSession.id != exclude_session_id)
        previous = session.scalars(query).first()
        if previous is None:
            continue
        sets = [s for s in previous.sets if s.exercise_id == exercise_id]
        substitute = None
        if not sets:
            sets = [s for s in previous.sets if s.planned_exercise_id == exercise_id]
            substitute = sets[0].exercise.name
        result[exercise_id] = {
            "session_id": previous.id,
            "day": previous.day.isoformat(),
            "substituted_by": substitute,
            "sets": [{"weight_kg": s.weight_kg, "reps": s.reps, "rir": s.rir, "notes": s.notes} for s in sets],
            "summary": ", ".join(format_set(s) for s in sets),
        }
    return result
