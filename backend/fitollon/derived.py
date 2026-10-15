"""Fitollon's own trend weight and energy expenditure, so both keep updating without MacroFactor exports.

Both continue from the latest MacroFactor export value when there is one, so the series stay continuous:

- Trend weight: exponentially smoothed scale weight (10% per day, scaled up after gaps between weigh-ins),
  ignoring obvious typos.
- Expenditure: average logged intake minus the energy in the trend weight's change (7,700 kcal per kg) over
  a 21-day window, then smoothed. It only moves while enough days are logged; otherwise it holds.

MacroFactor's own algorithm isn't public, so the numbers are close to but not identical with its values.
"""

from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from fitollon import insights
from fitollon.ingest.health_auto_export import MetricRow
from fitollon.ingest.store import upsert_metrics
from fitollon.models import DailyMetric

PROVIDER = "fitollon"
TREND_ALPHA = 0.1
MAX_DEVIATION = 0.10  # weigh-ins further than this from the trend are treated as typos
LONG_GAP_DAYS = 30
KCAL_PER_KG = 7700
WINDOW_DAYS = 21
MIN_LOGGED_DAYS = 12
MIN_WEIGH_INS = 5
MIN_COMPLETE_INTAKE = 1000  # kcal; days below this were most likely only partly logged
EXPENDITURE_ALPHA = 0.15
EARLIEST = date(2000, 1, 1)
ONE_DAY = timedelta(days=1)


def _macrofactor(session: Session, metric: str) -> dict[date, float]:
    rows = session.execute(
        select(DailyMetric.day, DailyMetric.value).where(
            DailyMetric.metric == metric, DailyMetric.provider == "macrofactor"
        )
    ).all()
    return {day: value for day, value in rows}


def trend_weight(weights: dict[date, float], end: date, anchor: tuple[date, float] | None) -> dict[date, float]:
    if anchor:
        last_update, current = anchor
        day = last_update + ONE_DAY
    elif weights:
        day = last_update = min(weights)
        current = weights[day]
    else:
        return {}
    trend = {}
    while day <= end:
        if day in weights:
            gap = max((day - last_update).days, 1)
            # Skip typos like 828 for 82.8: more than 10% off the trend, unless a long gap explains it.
            if abs(weights[day] - current) <= MAX_DEVIATION * current or gap > LONG_GAP_DAYS:
                current += (1 - (1 - TREND_ALPHA) ** gap) * (weights[day] - current)
                last_update = day
        trend[day] = round(current, 2)
        day += ONE_DAY
    return trend


def _raw_expenditure(
    window_end: date, intake: dict[date, float], weights: dict[date, float], trend: dict[date, float]
) -> float | None:
    start = window_end - timedelta(days=WINDOW_DAYS - 1)
    logged = [v for d, v in intake.items() if start <= d <= window_end and v >= MIN_COMPLETE_INTAKE]
    weigh_ins = sum(1 for d in weights if start <= d <= window_end)
    if len(logged) < MIN_LOGGED_DAYS or weigh_ins < MIN_WEIGH_INS or start not in trend or window_end not in trend:
        return None
    kg_per_day = (trend[window_end] - trend[start]) / (WINDOW_DAYS - 1)
    return sum(logged) / len(logged) - kg_per_day * KCAL_PER_KG


def expenditure(
    intake: dict[date, float],
    weights: dict[date, float],
    trend: dict[date, float],
    end: date,
    anchor: tuple[date, float] | None,
) -> dict[date, float]:
    if anchor:
        day = anchor[0] + ONE_DAY
        current: float | None = anchor[1]
    elif trend:
        day, current = min(trend) + timedelta(days=WINDOW_DAYS - 1), None
    else:
        return {}
    last_complete_day = end - ONE_DAY  # today's food log isn't finished yet
    result = {}
    while day <= end:
        raw = _raw_expenditure(day, intake, weights, trend) if day <= last_complete_day else None
        if raw is not None:
            current = raw if current is None else current + EXPENDITURE_ALPHA * (raw - current)
        if current is not None:
            result[day] = round(current)
        day += ONE_DAY
    return result


def _replace(session: Session, metric: str, unit: str, values: dict[date, float]) -> None:
    """Store the computed series, dropping computed days it no longer covers (e.g. after a newer export)."""
    stale = delete(DailyMetric).where(DailyMetric.provider == PROVIDER, DailyMetric.metric == metric)
    if values:
        stale = stale.where((DailyMetric.day < min(values)) | (DailyMetric.day > max(values)))
    session.execute(stale)
    upsert_metrics(session, [MetricRow(day, metric, value, unit) for day, value in values.items()], PROVIDER)


def recompute(session: Session) -> None:
    """Refresh the computed trend weight and expenditure; called after every sync and import."""
    end = insights.today()
    weights, _ = insights.key_metric_series(session, "weight", EARLIEST, end)
    intake, _ = insights.key_metric_series(session, "calories", EARLIEST, end)

    mf_trend = _macrofactor(session, "weight_trend")
    trend_anchor = (max(mf_trend), mf_trend[max(mf_trend)]) if mf_trend else None
    computed_trend = trend_weight(weights, end, trend_anchor)

    mf_expenditure = _macrofactor(session, "expenditure")
    expenditure_anchor = (max(mf_expenditure), mf_expenditure[max(mf_expenditure)]) if mf_expenditure else None
    computed_expenditure = expenditure(intake, weights, {**mf_trend, **computed_trend}, end, expenditure_anchor)

    _replace(session, "weight_trend", "kg", computed_trend)
    _replace(session, "expenditure", "kcal", computed_expenditure)
