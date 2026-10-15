from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from fitollon.auth import require_user
from fitollon.db import get_session
from fitollon.insights import KEY_METRICS, key_metric_series, last_training_session, today
from fitollon.models import IngestEvent, Memory, Profile

router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])


@router.get("/dashboard")
def dashboard(session: Session = Depends(get_session)) -> dict:
    end = today()
    start = end - timedelta(days=29)
    week_start = end - timedelta(days=6)

    metrics = {}
    for key in KEY_METRICS:
        series, unit = key_metric_series(session, key, start, end)
        if not series:
            continue
        last_day = max(series)
        week = [v for d, v in series.items() if d >= week_start]
        metrics[key] = {
            "unit": unit,
            "latest": series[last_day],
            "latest_day": last_day.isoformat(),
            "avg7": sum(week) / len(week) if week else None,
            "series": [{"day": d.isoformat(), "value": v} for d, v in sorted(series.items())],
        }

    last = last_training_session(session)
    last_sync = session.scalars(
        select(IngestEvent.received_at)
        .where(IngestEvent.source == "health_auto_export", IngestEvent.status == "ok")
        .order_by(IngestEvent.id.desc())
        .limit(1)
    ).first()
    return {
        "today": end.isoformat(),
        "metrics": metrics,
        "last_training": {"day": last.day.isoformat(), "title": last.title} if last else None,
        "last_sync": last_sync.isoformat() if last_sync else None,
    }


class ProfileBody(BaseModel):
    about: str
    goals: str


@router.get("/profile")
def get_profile(session: Session = Depends(get_session)) -> dict:
    profile = session.get(Profile, 1)
    memories = session.scalars(select(Memory).order_by(Memory.id)).all()
    return {
        "about": profile.about if profile else "",
        "goals": profile.goals if profile else "",
        "memories": [{"id": m.id, "content": m.content} for m in memories],
    }


@router.put("/profile")
def put_profile(body: ProfileBody, session: Session = Depends(get_session)) -> dict:
    profile = session.get(Profile, 1) or Profile(id=1)
    profile.about, profile.goals = body.about, body.goals
    session.add(profile)
    return {"ok": True}


@router.delete("/memories/{memory_id}")
def delete_memory(memory_id: int, session: Session = Depends(get_session)) -> dict:
    memory = session.get(Memory, memory_id)
    if memory is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Memory not found")
    session.delete(memory)
    return {"ok": True}


@router.get("/sync-events")
def sync_events(session: Session = Depends(get_session)) -> list[dict]:
    events = session.scalars(select(IngestEvent).order_by(IngestEvent.id.desc()).limit(10)).all()
    return [
        {
            "received_at": e.received_at.isoformat(),
            "source": e.source,
            "status": e.status,
            "summary": e.summary,
            "error": e.error,
        }
        for e in events
    ]
