"""Local maintenance commands.

uv run python -m fitollon.cli models        # list models your API key can use (pick one for MODEL_ID)
uv run python -m fitollon.cli secret        # generate a random value for SESSION_SECRET / INGEST_TOKEN
"""

import argparse
import secrets
import sys

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


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="fitollon")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("models", help="list models available to the configured provider")
    sub.add_parser("secret", help="print a random secret")
    args = parser.parse_args(argv)

    if args.command == "models":
        list_models()
    elif args.command == "secret":
        print(secrets.token_urlsafe(32))


if __name__ == "__main__":
    sys.exit(main())
