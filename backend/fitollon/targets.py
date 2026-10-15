"""Daily nutrition goals, from MacroFactor's program history (export) or entered in the app.

MacroFactor doesn't write its goals to Apple Health, so they can't sync; newer goals are entered by hand.
"""

from bisect import bisect_right
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from fitollon.models import NutritionTarget

FIELDS = ("calories", "protein", "carbs", "fat")


@dataclass
class TargetRow:
    start_day: date
    weekday: int  # 0 = Monday
    calories: float | None
    protein: float | None
    carbs: float | None
    fat: float | None


def upsert_targets(session: Session, rows: list[TargetRow], source: str) -> int:
    if not rows:
        return 0
    stmt = insert(NutritionTarget).values([{**asdict(r), "source": source} for r in rows])
    stmt = stmt.on_conflict_do_update(
        index_elements=["start_day", "weekday"],
        set_={field: stmt.excluded[field] for field in (*FIELDS, "source")} | {"updated_at": func.now()},
    )
    session.execute(stmt)
    return len(rows)


def save_targets(session: Session, start_day: date, values: dict[str, float | None]) -> None:
    """Goals entered in the app apply to every weekday from start_day on."""
    upsert_targets(session, [TargetRow(start_day, weekday, **values) for weekday in range(7)], "manual")


def remove_targets(session: Session, start_day: date) -> None:
    session.execute(delete(NutritionTarget).where(NutritionTarget.start_day == start_day))


def targets_between(session: Session, start: date, end: date) -> dict[date, dict[str, float | None]]:
    """The goals in effect on each day from start to end (days before the first goals are left out)."""
    rows = session.scalars(
        select(NutritionTarget).where(NutritionTarget.start_day <= end).order_by(NutritionTarget.start_day)
    ).all()
    by_weekday: dict[int, list[NutritionTarget]] = defaultdict(list)
    for row in rows:
        by_weekday[row.weekday].append(row)
    starts = {weekday: [r.start_day for r in items] for weekday, items in by_weekday.items()}

    result = {}
    day = start
    while day <= end:
        weekday = day.weekday()
        index = bisect_right(starts.get(weekday, []), day) - 1
        if index >= 0:
            row = by_weekday[weekday][index]
            result[day] = {field: getattr(row, field) for field in FIELDS}
        day += timedelta(days=1)
    return result


def targets_for(session: Session, day: date) -> dict[str, float | None] | None:
    return targets_between(session, day, day).get(day)


def history(session: Session, limit: int = 8) -> list[dict]:
    """The latest goal changes, newest first; "varies" when the weekdays have different goals."""
    rows = session.scalars(
        select(NutritionTarget).order_by(NutritionTarget.start_day.desc(), NutritionTarget.weekday)
    ).all()
    changes: dict[date, list[NutritionTarget]] = defaultdict(list)
    for row in rows:
        changes[row.start_day].append(row)
    result = []
    for start_day, items in list(changes.items())[:limit]:
        values = [tuple(getattr(r, f) for f in FIELDS) for r in items]
        first = items[0]
        result.append(
            {
                "start_day": start_day.isoformat(),
                **{field: getattr(first, field) for field in FIELDS},
                "varies": len(set(values)) > 1,
                "source": first.source,
            }
        )
    return result
