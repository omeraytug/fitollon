# fitollon

Apollon's health & fitness ecosystem: one place for nutrition, weight, steps, Apple Watch metrics and training,
plus an AI coach that reads all of it on its own.

## How it fits together

```
iPhone ── Health Auto Export ──POST /api/ingest/health-auto-export──┐
 (Apple Health: steps, Watch metrics, and MacroFactor's              │
  nutrition + weight, which MacroFactor writes into Apple Health)    ▼
                                                     backend/  FastAPI + Strands agent ──► Postgres
browser ── frontend/  Next.js (dashboard, coach chat, settings) ──/api/*──┘                (Neon on Vercel)
```

- **backend/**: Python 3.12, FastAPI, SQLAlchemy and Alembic, plus the [Strands Agents](https://strandsagents.com) coach.
  The coach has tools to read daily metrics, trends, workouts and the training log, to log sessions you
  describe, to remember facts about you, and to run read-only SQL.
- **frontend/**: Next.js. It holds no data logic and calls the backend for everything.
- **vercel.json**: deploys both as [Vercel Services](https://vercel.com/docs/services) in one project. `/api/*`
  goes to the backend and everything else to the frontend.

MacroFactor has no public API. Its daily nutrition and weight reach the app through Apple Health. An importer
for its in-app data export (for expenditure/TDEE, weight trend and full history) is planned.

## Local development

Requires Docker, [uv](https://docs.astral.sh/uv/) and Node 22+.

```bash
docker compose up -d                      # Postgres on localhost:5433

cd backend
cp ../.env.example .env                   # then fill it in (see comments inside)
uv sync
uv run python -m fitollon.cli secret      # use for SESSION_SECRET and INGEST_TOKEN
uv run python -m fitollon.cli models      # after setting OPENAI_API_KEY: pick a MODEL_ID
uv run alembic upgrade head
uv run uvicorn main:app --reload --port 8000

cd ../frontend                            # in a second terminal
npm install
npm run dev                               # http://localhost:3000 (forwards /api to :8000)
```

To send yourself test data, POST a Health Auto Export-style JSON payload:

```bash
curl -X POST localhost:8000/api/ingest/health-auto-export \
  -H "Authorization: Bearer $INGEST_TOKEN" -H 'content-type: application/json' \
  -d '{"data":{"metrics":[{"name":"step_count","units":"count","data":[{"date":"2026-10-15 00:00:00 +0200","qty":8000}]}]}}'
```

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel. Vercel builds it from `vercel.json`; nothing runs on
   GitHub Actions.
2. In the Vercel project, add a **Neon Postgres** database (Storage → Marketplace). It sets `DATABASE_URL`.
3. Add the other environment variables from `.env.example`: `APP_PASSWORD`, `SESSION_SECRET`,
   `INGEST_TOKEN`, `TIMEZONE`, `MODEL_PROVIDER`, `MODEL_ID`, `OPENAI_API_KEY`. Leave `COOKIE_SECURE` unset
   (it defaults to true).
4. Create the tables once, and again after any schema change, from your machine:
   `cd backend && DATABASE_URL='<neon connection string>' uv run alembic upgrade head`
5. Open the deployment, log in, and follow **Settings → Apple Health sync** to set up Health Auto Export with
   your deployment URL.

Vercel limits request bodies to 4.5 MB. Daily syncs are far below that. Large history imports will run as a
local script that writes straight to the database.

## Switching the AI model

Set `MODEL_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. `MODEL_ID` defaults to `claude-opus-5-5`. No code
changes are needed, and existing conversations continue on the new model. `MODEL_PARAMS` (JSON) passes extra
request parameters, such as `{"reasoning": {"effort": "medium"}}` for OpenAI reasoning models (OpenAI is called
through its Responses API).
