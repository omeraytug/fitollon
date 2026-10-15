# fitollon

Apollon's health & fitness ecosystem: one place for nutrition, weight, steps, Apple Watch metrics and training,
plus an AI coach that reads all of it on its own.

## How it fits together

```
iPhone ── Health Auto Export ──POST /api/ingest/health-auto-export──┐
 (Apple Health: steps, Watch metrics, and MacroFactor's              │
  nutrition + weight, which MacroFactor writes into Apple Health)    ▼
                                                     backend/  FastAPI + Strands agent ──► Postgres
browser ── frontend/  Next.js (home, training, coach, profile) ───/api/*──┘                (Neon on Vercel)
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

1. Import the GitHub repo in Vercel and keep the root directory as `./`; Vercel builds it from `vercel.json`,
   and nothing runs on GitHub Actions. Before the first deploy, add the environment variables from
   `.env.example`: `APP_PASSWORD`, `SESSION_SECRET`, `INGEST_TOKEN`, `TIMEZONE`, `MODEL_PROVIDER`, `MODEL_ID`,
   `OPENAI_API_KEY`. Vercel accepts a whole `.env` file pasted into the first key field. Leave `COOKIE_SECURE`
   unset; it defaults to true.
2. Add a **Neon** database (project → Storage → Create Database) in the region closest to you, and connect it to
   all environments. It sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`.
3. Run the functions in the same region as the database (Settings → Functions → Function Region, e.g. Frankfurt
   `fra1` for Neon's `aws-eu-central-1`). Each request makes several queries, so a cross-region hop adds up.
4. Create the tables from your machine, and again after any schema change, using the unpooled URL:
   `cd backend && DATABASE_URL='<DATABASE_URL_UNPOOLED>' uv run alembic upgrade head`
5. Redeploy so the new variables and region apply, log in, and set up the Apple Health sync below with your
   deployment URL.

Vercel limits request bodies to 4.5 MB. Daily syncs are far below that. Large history imports will run as a
local script that writes straight to the database.

## Apple Health sync (Health Auto Export)

MacroFactor writes food and weigh-ins to Apple Health, and the iPhone and Watch write steps and the rest. The
[Health Auto Export](https://apps.apple.com/app/id1115567069) app (Premium) sends it all to Fitollon:

1. In the Health app, give Health Auto Export read access (profile picture → Apps → Health Auto Export → Turn On All).
2. In Health Auto Export, open Automations and add a **REST API** automation:
   - URL: `https://<your deployment>/api/ingest/health-auto-export`
   - Header `Authorization` with value `Bearer <INGEST_TOKEN>`
   - Data: Health Metrics and Workouts. Format: JSON, Export Version 2.
   - Summarize Data on, aggregated by day. Date range: Previous 7 Days. Batch requests on.
   - Sync cadence: every hour. More often keeps the Neon database awake around the clock and uses up the free
     plan's compute hours.
3. iOS only lets apps read Health data while the phone is unlocked, so syncs happen when you use your phone.
   Re-sent days overwrite the stored values, never duplicate them. **Profile → Recent syncs** shows what arrived.

After each sync Fitollon recalculates trend weight and expenditure, continuing from the last MacroFactor export.

## Switching the AI model

Set `MODEL_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. `MODEL_ID` defaults to `claude-opus-5-5`. No code
changes are needed, and existing conversations continue on the new model. `MODEL_PARAMS` (JSON) passes extra
request parameters, such as `{"reasoning": {"effort": "medium"}}` for OpenAI reasoning models (OpenAI is called
through its Responses API).
