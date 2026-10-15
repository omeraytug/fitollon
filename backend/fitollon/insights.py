"""Shared lookups for the dashboard and the AI coach's always-on context."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from fitollon.config import get_settings
from fitollon.models import DailyMetric, TrainingSession

# Friendly name -> metric names it may be stored under (earlier names win). Apple Health names come from
# Health Auto Export; the MacroFactor importer uses the same names for the quantities both apps have.
KEY_METRICS: dict[str, list[str]] = {
    "weight_trend": ["weight_trend"],
    "weight": ["weight_body_mass", "weight_&_body_mass", "body_mass"],
    "calories": ["dietary_energy"],
    "expenditure": ["expenditure"],
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
    """Daily values for a friendly metric name.

    When several sources have the same day, the most recently changed value wins: a MacroFactor export is a
    snapshot (its last day may be half-logged), while Apple Health keeps updating recent days with every sync.
    """
    names = KEY_METRICS[key]
    rows = session.execute(
        select(DailyMetric.day, DailyMetric.metric, DailyMetric.updated_at, DailyMetric.value, DailyMetric.unit).where(
            DailyMetric.metric.in_(names), DailyMetric.day.between(start, end)
        )
    ).all()

    best: dict[date, tuple[tuple[int, float], float, str | None]] = {}
    for day, metric, updated_at, value, unit in rows:
        candidate = ((names.index(metric), -updated_at.timestamp()), value, unit)
        if day not in best or candidate[0] < best[day][0]:
            best[day] = candidate
    if not best:
        return {}, None
    series = {day: best[day][1] for day in sorted(best)}
    return series, best[max(best)][2]


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
