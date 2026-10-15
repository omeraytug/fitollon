from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from fitollon.auth import require_user
from fitollon.db import DbSession
from fitollon.insights import today
from fitollon.models import Exercise, Program, TemplateExercise, TrainingSession, TrainingSet, WorkoutTemplate
from fitollon.training import (
    active_program,
    cycles,
    get_or_create_exercise,
    last_for_exercise,
    last_for_slot,
    next_template,
    plan_occurrences,
)

router = APIRouter(prefix="/api/training", dependencies=[Depends(require_user)])

LoadType = Literal["total", "per_side"]


def _get(session: Session, model: type, id_: int):
    obj = session.get(model, id_)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found")
    return obj


def _exercise_dict(e: Exercise) -> dict:
    return {"id": e.id, "name": e.name, "load_type": e.load_type, "notes": e.notes}


# Exercises


class ExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    load_type: LoadType = "total"


class ExerciseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    load_type: LoadType | None = None
    notes: str | None = None


@router.get("/exercises")
def list_exercises(session: Session = DbSession) -> list[dict]:
    return [_exercise_dict(e) for e in session.scalars(select(Exercise).order_by(func.lower(Exercise.name)))]


@router.post("/exercises")
def create_exercise(body: ExerciseCreate, session: Session = DbSession) -> dict:
    return _exercise_dict(get_or_create_exercise(session, body.name, body.load_type))


@router.get("/exercises/{exercise_id}/last")
def exercise_last_time(
    exercise_id: int, exclude_session_id: int | None = None, session: Session = DbSession
) -> dict | None:
    return last_for_exercise(session, exercise_id, exclude_session_id)


@router.patch("/exercises/{exercise_id}")
def update_exercise(exercise_id: int, body: ExerciseUpdate, session: Session = DbSession) -> dict:
    exercise = _get(session, Exercise, exercise_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(exercise, field, value)
    return _exercise_dict(exercise)


# Programs: each is a cycle of workout templates; one is active


class ProgramCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    copy_from: int | None = None  # duplicate this program's sessions and exercises


class ProgramUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    notes: str | None = None


class PlannedExercise(BaseModel):
    exercise_id: int
    sets: int | None = Field(default=None, ge=1, le=20)
    rep_min: int | None = Field(default=None, ge=1, le=100)
    rep_max: int | None = Field(default=None, ge=1, le=100)
    rir_target: str | None = Field(default=None, max_length=20)
    notes: str | None = None


class TemplateBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    notes: str | None = None
    exercises: list[PlannedExercise] = []


def _template_dict(t: WorkoutTemplate) -> dict:
    return {
        "id": t.id,
        "program_id": t.program_id,
        "name": t.name,
        "position": t.position,
        "notes": t.notes,
        "exercises": [
            {
                "exercise_id": te.exercise_id,
                "name": te.exercise.name,
                "load_type": te.exercise.load_type,
                "sets": te.sets,
                "rep_min": te.rep_min,
                "rep_max": te.rep_max,
                "rir_target": te.rir_target,
                "notes": te.notes,
            }
            for te in t.exercises
        ],
    }


def _program_dict(session: Session, p: Program) -> dict:
    ids = [t.id for t in p.templates]
    count, first, last = (0, None, None)
    if ids:
        count, first, last = session.execute(
            select(func.count(TrainingSession.id), func.min(TrainingSession.day), func.max(TrainingSession.day)).where(
                TrainingSession.template_id.in_(ids)
            )
        ).one()
    return {
        "id": p.id,
        "name": p.name,
        "notes": p.notes,
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat(),
        "session_names": [t.name for t in p.templates],
        "logged_sessions": count,
        "first_day": first.isoformat() if first else None,
        "last_day": last.isoformat() if last else None,
    }


def _set_exercises(session: Session, template: WorkoutTemplate, planned: list[PlannedExercise]) -> None:
    for p in planned:
        _get(session, Exercise, p.exercise_id)
    template.exercises = [TemplateExercise(position=i, **p.model_dump()) for i, p in enumerate(planned)]


def _activate(session: Session, p: Program) -> None:
    # Clear the old active one first: the database allows only one active program at a time.
    session.execute(update(Program).where(Program.is_active, Program.id != p.id).values(is_active=False))
    session.flush()
    p.is_active = True


@router.get("/programs")
def list_programs(session: Session = DbSession) -> list[dict]:
    programs = session.scalars(select(Program).order_by(Program.is_active.desc(), Program.created_at.desc())).all()
    return [_program_dict(session, p) for p in programs]


@router.post("/programs")
def create_program(body: ProgramCreate, session: Session = DbSession) -> dict:
    new = Program(name=body.name)
    session.add(new)
    if body.copy_from is not None:
        source = _get(session, Program, body.copy_from)
        new.notes = source.notes
        for t in source.templates:
            new.templates.append(
                WorkoutTemplate(
                    name=t.name,
                    position=t.position,
                    notes=t.notes,
                    exercises=[
                        TemplateExercise(
                            exercise_id=te.exercise_id,
                            position=te.position,
                            sets=te.sets,
                            rep_min=te.rep_min,
                            rep_max=te.rep_max,
                            rir_target=te.rir_target,
                            notes=te.notes,
                        )
                        for te in t.exercises
                    ],
                )
            )
    session.flush()
    if active_program(session) is None:
        _activate(session, new)
    return _program_dict(session, new)


@router.get("/programs/{program_id}")
def get_program(program_id: int, session: Session = DbSession) -> dict:
    p = _get(session, Program, program_id)
    upcoming = next_template(session) if p.is_active else None
    return {
        **_program_dict(session, p),
        "templates": [_template_dict(t) for t in p.templates],
        "next_template_id": upcoming.id if upcoming else None,
    }


@router.patch("/programs/{program_id}")
def update_program(program_id: int, body: ProgramUpdate, session: Session = DbSession) -> dict:
    p = _get(session, Program, program_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    return _program_dict(session, p)


@router.post("/programs/{program_id}/activate")
def activate_program(program_id: int, session: Session = DbSession) -> dict:
    p = _get(session, Program, program_id)
    _activate(session, p)
    return _program_dict(session, p)


@router.delete("/programs/{program_id}")
def delete_program(program_id: int, session: Session = DbSession) -> dict:
    p = _get(session, Program, program_id)
    if p.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Switch to another program before deleting this one.")
    session.delete(p)  # logged sessions are kept; they just lose their link to the plan
    return {"ok": True}


@router.post("/programs/{program_id}/templates")
def create_template(program_id: int, body: TemplateBody, session: Session = DbSession) -> dict:
    p = _get(session, Program, program_id)
    position = max((t.position for t in p.templates), default=0) + 1
    template = WorkoutTemplate(name=body.name, notes=body.notes, position=position)
    p.templates.append(template)
    _set_exercises(session, template, body.exercises)
    session.flush()
    return _template_dict(template)


@router.put("/templates/{template_id}")
def update_template(template_id: int, body: TemplateBody, session: Session = DbSession) -> dict:
    template = _get(session, WorkoutTemplate, template_id)
    template.name, template.notes = body.name, body.notes
    _set_exercises(session, template, body.exercises)
    session.flush()
    return _template_dict(template)


@router.post("/templates/{template_id}/move")
def move_template(template_id: int, direction: Literal["up", "down"], session: Session = DbSession) -> dict:
    templates = list(_get(session, WorkoutTemplate, template_id).program.templates)
    index = next(i for i, t in enumerate(templates) if t.id == template_id)
    other = index - 1 if direction == "up" else index + 1
    if 0 <= other < len(templates):
        templates[index], templates[other] = templates[other], templates[index]
    for position, t in enumerate(templates, 1):
        t.position = position
    return {"ok": True}


@router.delete("/templates/{template_id}")
def delete_template(template_id: int, session: Session = DbSession) -> dict:
    session.delete(_get(session, WorkoutTemplate, template_id))
    return {"ok": True}


# Training overview: the active program's cycles, newest first


def _session_summary(ts: TrainingSession) -> dict:
    return {
        "id": ts.id,
        "day": ts.day.isoformat(),
        "title": ts.title or (ts.template.name if ts.template else "Session"),
        "set_count": len(ts.sets),
        "program_name": ts.template.program.name if ts.template else None,
    }


@router.get("/overview")
def overview(program_id: int | None = None, session: Session = DbSession) -> dict:
    """A program's cycles (the active one by default), plus recent sessions logged outside any program."""
    p = _get(session, Program, program_id) if program_id is not None else active_program(session)
    templates = list(p.templates) if p else []
    order = {t.id: i for i, t in enumerate(templates)}
    upcoming = next_template(session) if p is not None and p.is_active else None
    groups = cycles(session, templates)
    # In the active program, the latest cycle is still going if the next session comes later in it;
    # otherwise a fresh one starts.
    if upcoming is not None and (not groups or order[upcoming.id] <= order[groups[-1][-1].template_id]):
        groups.append([])

    result = []
    for number, group in enumerate(groups, 1):
        current = upcoming is not None and number == len(groups)
        done = {ts.template_id: ts for ts in group}
        reached = max((order[ts.template_id] for ts in group), default=-1)
        slots = []
        for i, t in enumerate(templates):
            ts = done.get(t.id)
            if ts:
                state = "done"
            elif current and t.id == upcoming.id:
                state = "next"
            elif not current or i < reached:
                state = "skipped"
            else:
                state = "upcoming"
            slots.append(
                {"template_id": t.id, "name": t.name, "status": state, "session": _session_summary(ts) if ts else None}
            )
        result.append(
            {
                "number": number,
                "current": current,
                "first_day": group[0].day.isoformat() if group else None,
                "last_day": group[-1].day.isoformat() if group else None,
                "slots": slots,
            }
        )

    others = session.scalars(
        select(TrainingSession)
        .where(TrainingSession.template_id.is_(None))
        .order_by(TrainingSession.day.desc(), TrainingSession.id.desc())
        .limit(20)
    ).all()
    return {
        "program": {"id": p.id, "name": p.name, "is_active": p.is_active} if p else None,
        "templates": [{"id": t.id, "name": t.name} for t in templates],
        "next_template_id": upcoming.id if upcoming else None,
        "cycles": list(reversed(result)),
        "other_sessions": [_session_summary(ts) for ts in others],
    }


# Sessions and sets


class SessionCreate(BaseModel):
    template_id: int | None = None
    day: date | None = None
    title: str | None = Field(default=None, max_length=200)


class SessionUpdate(BaseModel):
    day: date | None = None
    title: str | None = Field(default=None, max_length=200)
    notes: str | None = None


class SetBody(BaseModel):
    exercise_id: int
    # The plan slot: its planned exercise and which occurrence of it in the template. None for extras.
    planned_exercise_id: int | None = None
    plan_occurrence: int | None = Field(default=None, ge=0, le=20)
    weight_kg: float | None = Field(default=None, ge=0, le=1000)
    reps: int | None = Field(default=None, ge=0, le=1000)
    rir: float | None = Field(default=None, ge=0, le=10)
    notes: str | None = None


class SetUpdate(BaseModel):
    weight_kg: float | None = Field(default=None, ge=0, le=1000)
    reps: int | None = Field(default=None, ge=0, le=1000)
    rir: float | None = Field(default=None, ge=0, le=10)
    notes: str | None = None


def _set_dict(s: TrainingSet) -> dict:
    return {
        "id": s.id,
        "exercise_id": s.exercise_id,
        "planned_exercise_id": s.planned_exercise_id,
        "plan_occurrence": s.plan_occurrence,
        "position": s.position,
        "weight_kg": s.weight_kg,
        "reps": s.reps,
        "rir": s.rir,
        "notes": s.notes,
    }


def _session_dict(session: Session, ts: TrainingSession) -> dict:
    exercises = {s.exercise_id: s.exercise for s in ts.sets}
    slot_last_time = []
    if ts.template:
        exercises.update({te.exercise_id: te.exercise for te in ts.template.exercises})
        slot_last_time = [
            last_for_slot(session, ts.template.id, te.exercise_id, occurrence, exclude_session_id=ts.id)
            for te, occurrence in zip(ts.template.exercises, plan_occurrences(ts.template), strict=True)
        ]
    return {
        "id": ts.id,
        "day": ts.day.isoformat(),
        "title": ts.title,
        "notes": ts.notes,
        "template": _template_dict(ts.template) if ts.template else None,
        "sets": [_set_dict(s) for s in ts.sets],
        "exercises": {e.id: _exercise_dict(e) for e in exercises.values()},
        # Per plan slot (same order as template.exercises), and per exercise for swaps and extras.
        "slot_last_time": slot_last_time,
        "last_time": {
            e: last_for_exercise(session, e, exclude_session_id=ts.id) for e in {s.exercise_id for s in ts.sets}
        },
    }


@router.post("/sessions")
def create_session(body: SessionCreate, session: Session = DbSession) -> dict:
    template = _get(session, WorkoutTemplate, body.template_id) if body.template_id else None
    ts = TrainingSession(
        day=body.day or today(),
        title=body.title or (template.name if template else None),
        template=template,
        source="app",
    )
    session.add(ts)
    session.flush()
    return {"id": ts.id}


@router.get("/sessions/{session_id}")
def get_training_session(session_id: int, session: Session = DbSession) -> dict:
    return _session_dict(session, _get(session, TrainingSession, session_id))


@router.patch("/sessions/{session_id}")
def update_session(session_id: int, body: SessionUpdate, session: Session = DbSession) -> dict:
    ts = _get(session, TrainingSession, session_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ts, field, value)
    return {"ok": True}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, session: Session = DbSession) -> dict:
    session.delete(_get(session, TrainingSession, session_id))
    return {"ok": True}


@router.post("/sessions/{session_id}/sets")
def add_set(session_id: int, body: SetBody, session: Session = DbSession) -> dict:
    ts = _get(session, TrainingSession, session_id)
    _get(session, Exercise, body.exercise_id)
    position = max((s.position for s in ts.sets), default=0) + 1
    new_set = TrainingSet(position=position, **body.model_dump())
    ts.sets.append(new_set)
    session.flush()
    return _set_dict(new_set)


@router.patch("/sets/{set_id}")
def update_set(set_id: int, body: SetUpdate, session: Session = DbSession) -> dict:
    training_set = _get(session, TrainingSet, set_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(training_set, field, value)
    return _set_dict(training_set)


@router.delete("/sets/{set_id}")
def delete_set(set_id: int, session: Session = DbSession) -> dict:
    session.delete(_get(session, TrainingSet, set_id))
    return {"ok": True}
