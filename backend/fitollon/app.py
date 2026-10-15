import logging

from fastapi import FastAPI

from fitollon.routes import auth, chat, data, ingest, media, training

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Fitollon API", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(auth.router)
app.include_router(ingest.router)
app.include_router(data.router)
app.include_router(chat.router)
app.include_router(training.router)
app.include_router(media.router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}
