# Vercel entrypoint (see vercel.json). Locally: uv run uvicorn main:app --reload --port 8000
from fitollon.app import app

__all__ = ["app"]
