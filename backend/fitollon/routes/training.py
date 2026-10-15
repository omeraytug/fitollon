from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from fitollon.auth import require_user
from fitollon.db import get_session
from fitollon.insights import today
from fitollon.models import Exercise, TemplateExercise, TrainingSession, TrainingSet, WorkoutTemplate
from fitollon.training import (
    get_or_create_exercise,
    last_for_exercise,
    last_for_slot,
    next_template,
    plan_occurrences,
    program,
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
def list_exercises(session: Session = Depends(get_session)) -> list[dict]:
    return [_exercise_dict(e) for e in session.scalars(select(Exercise).order_by(func.lower(Exercise.name)))]


@router.post("/exercises")
def create_exercise(body: ExerciseCreate, session: Session = Depends(get_session)) -> dict:
    return _exercise_dict(get_or_create_exercise(session, body.name, body.load_type))


@router.get("/exercises/{exercise_id}/last")
def exercise_last_time(
    exercise_id: int, exclude_session_id: int | None = None, session: Session = Depends(get_session)
) -> dict | None:
    return last_for_exercise(session, exercise_id, exclude_session_id)


@router.patch("/exercises/{exercise_id}")
def update_exercise(exercise_id: int, body: ExerciseUpdate, session: Session = Depends(get_session)) -> dict:
    exercise = _get(session, Exercise, exercise_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(exercise, field, value)
    return _exercise_dict(exercise)


# Program: the cycle of workout templates


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


def _set_exercises(session: Session, template: WorkoutTemplate, planned: list[PlannedExercise]) -> None:
    for p in planned:
        _get(session, Exercise, p.exercise_id)
    template.exercises = [TemplateExercise(position=i, **p.model_dump()) for i, p in enumerate(planned)]


@router.get("/program")
def get_program(session: Session = Depends(get_session)) -> dict:
    upcoming = next_template(session)
    return {
        "templates": [_template_dict(t) for t in program(session)],
        "next_template_id": upcoming.id if upcoming else None,
    }


@router.post("/program/templates")
def create_template(body: TemplateBody, session: Session = Depends(get_session)) -> dict:
    position = (session.scalar(select(func.max(WorkoutTemplate.position))) or 0) + 1
    template = WorkoutTemplate(name=body.name, notes=body.notes, position=position)
    session.add(template)
    _set_exercises(session, template, body.exercises)
    session.flush()
    return _template_dict(template)


@router.put("/program/templates/{template_id}")
def update_template(template_id: int, body: TemplateBody, session: Session = Depends(get_session)) -> dict:
    template = _get(session, WorkoutTemplate, template_id)
    template.name, template.notes = body.name, body.notes
    _set_exercises(session, template, body.exercises)
    session.flush()
    return _template_dict(template)


@router.post("/program/templates/{template_id}/move")
def move_template(template_id: int, direction: Literal["up", "down"], session: Session = Depends(get_session)) -> dict:
    templates = program(session)
    index = next((i for i, t in enumerate(templates) if t.id == template_id), None)
    if index is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "WorkoutTemplate not found")
    other = index - 1 if direction == "up" else index + 1
    if 0 <= other < len(templates):
        templates[index], templates[other] = templates[other], templates[index]
    for position, t in enumerate(templates, 1):
        t.position = position
    return {"ok": True}


@router.delete("/program/templates/{template_id}")
def delete_template(template_id: int, session: Session = Depends(get_session)) -> dict:
    session.delete(_get(session, WorkoutTemplate, template_id))
    return {"ok": True}


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


@router.get("/sessions")
def list_sessions(limit: int = 30, session: Session = Depends(get_session)) -> list[dict]:
    sessions = session.scalars(
        select(TrainingSession).order_by(TrainingSession.day.desc(), TrainingSession.id.desc()).limit(min(limit, 200))
    ).all()
    return [
        {
            "id": ts.id,
            "day": ts.day.isoformat(),
            "title": ts.title or (ts.template.name if ts.template else "Session"),
            "set_count": len(ts.sets),
            "exercises": list(dict.fromkeys(s.exercise.name for s in ts.sets)),
        }
        for ts in sessions
    ]


@router.post("/sessions")
def create_session(body: SessionCreate, session: Session = Depends(get_session)) -> dict:
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
def get_training_session(session_id: int, session: Session = Depends(get_session)) -> dict:
    return _session_dict(session, _get(session, TrainingSession, session_id))


@router.patch("/sessions/{session_id}")
def update_session(session_id: int, body: SessionUpdate, session: Session = Depends(get_session)) -> dict:
    ts = _get(session, TrainingSession, session_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ts, field, value)
    return {"ok": True}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, session: Session = Depends(get_session)) -> dict:
    session.delete(_get(session, TrainingSession, session_id))
    return {"ok": True}


@router.post("/sessions/{session_id}/sets")
def add_set(session_id: int, body: SetBody, session: Session = Depends(get_session)) -> dict:
    ts = _get(session, TrainingSession, session_id)
    _get(session, Exercise, body.exercise_id)
    position = max((s.position for s in ts.sets), default=0) + 1
    new_set = TrainingSet(position=position, **body.model_dump())
    ts.sets.append(new_set)
    session.flush()
    return _set_dict(new_set)


@router.patch("/sets/{set_id}")
def update_set(set_id: int, body: SetUpdate, session: Session = Depends(get_session)) -> dict:
    training_set = _get(session, TrainingSet, set_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(training_set, field, value)
    return _set_dict(training_set)


@router.delete("/sets/{set_id}")
def delete_set(set_id: int, session: Session = Depends(get_session)) -> dict:
    session.delete(_get(session, TrainingSet, set_id))
    return {"ok": True}
