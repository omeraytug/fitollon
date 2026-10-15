"""Shared lookups for the dashboard and the AI coach's always-on context."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from fitollon.config import get_settings
from fitollon.models import DailyMetric, TrainingSession

# Friendly name -> metric names it may be stored under (first match wins). Apple Health names come
# from Health Auto Export; MacroFactor writes nutrition and weight into Apple Health too.
KEY_METRICS: dict[str, list[str]] = {
    "weight": ["weight_body_mass", "weight_&_body_mass", "body_mass"],
    "calories": ["dietary_energy"],
    "protein": ["protein"],
    "carbs": ["carbohydrates"],
    "fat": ["total_fat"],
    "steps": ["step_count"],
    "active_energy": ["active_energy"],
    "resting_hr": ["resting_heart_rate"],
    "sleep": ["sleep_analysis.total_sleep", "sleep_analysis.asleep"],
}


def today() -> date:
    return datetime.now(ZoneInfo(get_settings().timezone)).date()


def key_metric_series(session: Session, key: str, start: date, end: date) -> tuple[dict[date, float], str | None]:
    """Daily values for a friendly metric name, preferring the first alias that has data."""
    for name in KEY_METRICS[key]:
        rows = session.execute(
            select(DailyMetric.day, DailyMetric.value, DailyMetric.unit)
            .where(DailyMetric.metric == name, DailyMetric.day.between(start, end))
            .order_by(DailyMetric.day, DailyMetric.provider)
        ).all()
        if rows:
            series: dict[date, float] = {}
            for day, value, _ in rows:
                series.setdefault(day, value)
            return series, rows[-1].unit
    return {}, None


def latest_value(session: Session, key: str) -> tuple[date, float, str | None] | None:
    for name in KEY_METRICS[key]:
        row = session.execute(
            select(DailyMetric.day, DailyMetric.value, DailyMetric.unit)
            .where(DailyMetric.metric == name)
            .order_by(DailyMetric.day.desc())
            .limit(1)
        ).first()
        if row:
            return row.day, row.value, row.unit
    return None


def last_training_session(session: Session) -> TrainingSession | None:
    return session.scalars(
        select(TrainingSession).order_by(TrainingSession.day.desc(), TrainingSession.id.desc()).limit(1)
    ).first()


def recent_snapshot(session: Session, days: int = 7) -> str:
    """Compact text table of the last few days, given to the AI with every message."""
    end = today()
    start = end - timedelta(days=days - 1)
    columns: list[tuple[str, dict[date, float], str | None]] = []
    for key in KEY_METRICS:
        series, unit = key_metric_series(session, key, start, end)
        if series:
            columns.append((key, series, unit))

    lines = []
    if columns:
        lines.append("day | " + " | ".join(f"{key} ({unit or '?'})" for key, _, unit in columns))
        for offset in range(days):
            day = start + timedelta(days=offset)
            cells = [_fmt(series.get(day)) for _, series, _ in columns]
            lines.append(f"{day:%a %Y-%m-%d} | " + " | ".join(cells))
    else:
        lines.append("No health data synced for the last 7 days.")

    last = last_training_session(session)
    if last:
        lines.append(f"Last logged training session: {last.day:%a %Y-%m-%d} {last.title or ''}".rstrip())
    return "\n".join(lines)


def _fmt(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:,.0f}" if abs(value) >= 100 else f"{value:.1f}"
