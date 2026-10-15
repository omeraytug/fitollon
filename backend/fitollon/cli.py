"""Local maintenance commands.

uv run python -m fitollon.cli models        # list models your API key can use (pick one for MODEL_ID)
uv run python -m fitollon.cli secret        # generate a random value for SESSION_SECRET / INGEST_TOKEN
uv run python -m fitollon.cli import-macrofactor ../imports/MacroFactor-....xlsx
uv run python -m fitollon.cli import-macrofactor --goals-only ../imports/MacroFactor-....xlsx

Imports write to DATABASE_URL: the local database by default, or production when you prefix the command
with DATABASE_URL='<Neon unpooled URL>'.
"""

import argparse
import secrets
import sys
from collections import defaultdict
from pathlib import Path

from sqlalchemy.engine import make_url

from fitollon.config import get_settings


def list_models() -> None:
    settings = get_settings()
    if settings.model_provider == "openai":
        from openai import OpenAI

        ids = sorted(m.id for m in OpenAI(api_key=settings.openai_api_key).models.list())
    else:
        from anthropic import Anthropic

        ids = sorted(m.id for m in Anthropic(api_key=settings.anthropic_api_key).models.list())
    print("\n".join(ids))


def import_macrofactor(path: Path, goals_only: bool = False) -> None:
    from fitollon import derived
    from fitollon.db import session_scope
    from fitollon.ingest import macrofactor
    from fitollon.ingest.store import upsert_metrics
    from fitollon.models import IngestEvent
    from fitollon.targets import upsert_targets

    url = make_url(get_settings().sqlalchemy_url)
    print(f"Database: {url.host}:{url.port or 5432}/{url.database}")

    goals = macrofactor.parse_targets(path)
    if goals_only:
        # Only the nutrition goal history; daily values stay as they are (e.g. typos fixed since the export).
        with session_scope() as session:
            upsert_targets(session, goals, macrofactor.PROVIDER)
            summary = {"goal_days": len(goals), "file": path.name}
            session.add(IngestEvent(source="macrofactor_export", status="ok", summary=summary))
        print(f"Imported {len(goals)} nutrition goal rows from {len({g.start_day for g in goals})} program updates.")
        return

    rows = macrofactor.parse_workbook(path)
    by_metric = defaultdict(list)
    for row in rows:
        by_metric[row.metric].append(row.day)
    for metric, days in sorted(by_metric.items()):
        print(f"  {metric:<28} {len(days):>4} days  {min(days)} → {max(days)}")

    with session_scope() as session:
        count = upsert_metrics(session, rows, macrofactor.PROVIDER)
        upsert_targets(session, goals, macrofactor.PROVIDER)
        derived.recompute(session)
        summary = {"metric_days": count, "goal_days": len(goals), "file": path.name}
        session.add(IngestEvent(source="macrofactor_export", status="ok", summary=summary))
    print(f"Imported {count} metric-days from {len(by_metric)} metrics, and {len(goals)} nutrition goal rows.")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="fitollon")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("models", help="list models available to the configured provider")
    sub.add_parser("secret", help="print a random secret")
    import_mf = sub.add_parser("import-macrofactor", help="import a MacroFactor .xlsx data export")
    import_mf.add_argument("path", type=Path)
    import_mf.add_argument("--goals-only", action="store_true", help="import only the nutrition goal history")
    args = parser.parse_args(argv)

    if args.command == "models":
        list_models()
    elif args.command == "secret":
        print(secrets.token_urlsafe(32))
    elif args.command == "import-macrofactor":
        import_macrofactor(args.path, args.goals_only)


if __name__ == "__main__":
    sys.exit(main())
