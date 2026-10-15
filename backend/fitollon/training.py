"""Training log helpers shared by the API and the AI coach's tools."""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from fitollon.models import Exercise, Program, TrainingSession, TrainingSet, WorkoutTemplate

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


def active_program(session: Session) -> Program | None:
    return session.scalars(select(Program).where(Program.is_active)).first()


def ensure_active_program(session: Session) -> Program:
    """The active program, creating a first one if there is none yet."""
    active = active_program(session)
    if active is None:
        active = Program(name="My program", is_active=True)
        session.add(active)
        session.flush()
    return active


def program(session: Session) -> list[WorkoutTemplate]:
    """The active program's sessions in cycle order."""
    active = active_program(session)
    return list(active.templates) if active else []


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


def cycles(session: Session, templates: list[WorkoutTemplate]) -> list[list[TrainingSession]]:
    """The program's logged sessions in date order, split into cycles.

    A new cycle starts when a session comes at or before the previous one's place in the program, so skipping
    a session keeps the cycle going and repeating one starts the next.
    """
    order = {t.id: i for i, t in enumerate(templates)}
    if not order:
        return []
    sessions = session.scalars(
        select(TrainingSession)
        .where(TrainingSession.template_id.in_(list(order)))
        .order_by(TrainingSession.day, TrainingSession.id)
    ).all()
    groups: list[list[TrainingSession]] = []
    for ts in sessions:
        if not groups or order[ts.template_id] <= order[groups[-1][-1].template_id]:
            groups.append([])
        groups[-1].append(ts)
    return groups


def plan_occurrences(template: WorkoutTemplate) -> list[int]:
    """For each planned exercise, how many times the same exercise appeared earlier in the template."""
    seen: dict[int, int] = {}
    occurrences = []
    for te in template.exercises:
        occurrences.append(seen.get(te.exercise_id, 0))
        seen[te.exercise_id] = occurrences[-1] + 1
    return occurrences


def _last_dict(previous: TrainingSession, sets: list[TrainingSet]) -> dict[str, Any]:
    return {
        "session_id": previous.id,
        "day": previous.day.isoformat(),
        "template_name": previous.template.name if previous.template else None,
        "exercise_id": sets[0].exercise_id,
        "exercise_name": sets[0].exercise.name,
        "sets": [{"weight_kg": s.weight_kg, "reps": s.reps, "rir": s.rir, "notes": s.notes} for s in sets],
        "summary": ", ".join(format_set(s) for s in sets),
    }


def _latest(session: Session, *conditions, exclude_session_id: int | None) -> TrainingSession | None:
    query = select(TrainingSession).where(*conditions).order_by(TrainingSession.day.desc(), TrainingSession.id.desc())
    if exclude_session_id is not None:
        query = query.where(TrainingSession.id != exclude_session_id)
    return session.scalars(query.limit(1)).first()


def last_for_exercise(session: Session, exercise_id: int, exclude_session_id: int | None = None) -> dict | None:
    """The sets of this exercise from the most recent other session that included it, in any slot."""
    previous = _latest(
        session, TrainingSession.sets.any(TrainingSet.exercise_id == exercise_id), exclude_session_id=exclude_session_id
    )
    if previous is None:
        return None
    return _last_dict(previous, [s for s in previous.sets if s.exercise_id == exercise_id])


def last_for_slot(
    session: Session, template_id: int, planned_exercise_id: int, occurrence: int, exclude_session_id: int | None
) -> dict | None:
    """What was done in this plan slot the last time this template was trained, whichever exercise it was.

    Falls back to the planned exercise's latest sets from any session (e.g. before the first time in this
    template); "template_name" tells the caller where the numbers came from.
    """

    def in_slot(s) -> bool:
        return s.planned_exercise_id == planned_exercise_id and (s.plan_occurrence or 0) == occurrence

    previous = _latest(
        session,
        TrainingSession.template_id == template_id,
        TrainingSession.sets.any(
            (TrainingSet.planned_exercise_id == planned_exercise_id)
            & (func.coalesce(TrainingSet.plan_occurrence, 0) == occurrence)
        ),
        exclude_session_id=exclude_session_id,
    )
    if previous is not None:
        return _last_dict(previous, [s for s in previous.sets if in_slot(s)])
    return last_for_exercise(session, planned_exercise_id, exclude_session_id)
