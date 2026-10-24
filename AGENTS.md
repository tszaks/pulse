# Pulse

Self-hosted [Umami](https://umami.is) analytics plus a read-only Fastify and TypeScript API (`agent-api/`) that returns analytics in plain English for AI agents.

This file is for AI agents that work **on** Pulse's code. If you are an agent that **uses** Pulse, read [docs/agents.md](docs/agents.md) and [docs/api.md](docs/api.md).

## Build and run
- Install and build: `cd agent-api && npm ci && npm run build` (runs `tsc`, strict mode, output in `dist/`). Run it before you say something works.
- There are no automated tests. Check a change by running the API against a local Umami (`docker compose up -d postgres umami`) and calling the route with `curl`.
- Dev server: `UMAMI_BASE_URL=http://localhost:3000 UMAMI_PASSWORD=... PULSE_API_KEYS=testkey PORT=3001 npm run dev`. Set `PORT=3001`: the default is 3000, which is Umami's port in the local setup.
- Env vars read by the code: `UMAMI_BASE_URL`, `UMAMI_USERNAME` (default `admin`), `UMAMI_PASSWORD`, `PULSE_API_KEYS` (comma-separated), `PORT` (default `3000`). `DB_PASSWORD` and `APP_SECRET` are only for `docker-compose.yml`.
- Do not start a server on a port the user may be using, and do not stop processes you did not start.

## Code map
- `agent-api/src/server.ts`: Fastify setup, CORS, rate limit (60/min), route registration, `listen`.
- `agent-api/src/routes/`: one file per route group. `query.ts` is the natural-language entry point.
- `agent-api/src/lib/umami-client.ts`: every Umami call, plus the 22-hour login token cache. New Umami endpoints go here.
- `agent-api/src/lib/auth.ts`: `requireApiKey`, checks the bearer token against `PULSE_API_KEYS` (read once at startup).
- `agent-api/src/lib/llm-formatter.ts`: turns data into `summary` and `context_for_agent`. Response wording lives here.
- `agent-api/src/lib/nl-parser.ts`: keyword to intent and period. Add phrases to `INTENT_PATTERNS` or `PERIOD_PATTERNS`. First match wins, so order matters.
- `agent-api/src/lib/anomaly.ts`: z-score detection, threshold 2.0.
- `agent-api/src/types.ts`: shared types and the `PERIODS` list.
- `docs/`: API reference, agent guide, deployment guide.

## Conventions
- Match the surrounding code: naming, comment density, idiom. Local imports use the `.js` suffix.
- Every `/v1/*` route uses `preHandler: requireApiKey`.
- Every data response has `summary`, `data` and `context_for_agent`.
- Adding a period: change `PERIODS` and `PERIOD_DAYS` in `types.ts`, `periodLabel` in `llm-formatter.ts`, and `PERIOD_PATTERNS` in `nl-parser.ts`.
- Adding a route: write the Umami call in `umami-client.ts`, add a route file, register it in `server.ts`, and document it in `docs/api.md`.
- Update `README.md`, `docs/` and `CHANGELOG.md` when you change a route, an env var or a response shape.

## Do not
- Do not add routes that write to Umami. Pulse is read-only.
- Do not log or return `UMAMI_PASSWORD`, Umami tokens or API keys.
- Do not put real site names, domains, keys or URLs in code, docs or commits. Use `example.com`.
- Do not add dependencies without discussion.
- Do not weaken auth or the rate limit.
