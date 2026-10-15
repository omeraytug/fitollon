from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, status

from fitollon.auth import require_ingest_token
from fitollon.db import session_scope
from fitollon.ingest import health_auto_export
from fitollon.ingest.store import upsert_metrics, upsert_workouts
from fitollon.models import IngestEvent

router = APIRouter(prefix="/api/ingest", tags=["ingest"], dependencies=[Depends(require_ingest_token)])


@router.post("/health-auto-export")
def health_auto_export_sync(payload: dict[str, Any] = Body(...)) -> dict:
    """Receives the Health Auto Export app's REST API automation (JSON, Export Version 2)."""
    try:
        metrics, workouts = health_auto_export.parse_payload(payload)
        with session_scope() as session:
            summary = {
                "metric_days": upsert_metrics(session, metrics, health_auto_export.PROVIDER),
                "workouts": upsert_workouts(session, workouts, health_auto_export.PROVIDER),
            }
            session.add(IngestEvent(source="health_auto_export", status="ok", summary=summary, payload=payload))
    except Exception as exc:
        with session_scope() as session:
            session.add(
                IngestEvent(source="health_auto_export", status="error", error=str(exc)[:2000], payload=payload)
            )
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Could not process payload: {exc}") from exc
    return {"ok": True, **summary}
