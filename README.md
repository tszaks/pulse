# Pulse

**Agent-native web analytics.** Self-hosted Umami for data collection + a Fastify API layer that makes your analytics queryable by AI agents in plain English.

Ask your AI assistant "how did my site do this week?" and get a real answer.

---

## What it is

Most analytics platforms have APIs — but they return raw time-series data that agents have to interpret. Pulse wraps [Umami](https://umami.is) with an opinionated API designed specifically for AI agents: ranked, narrated, context-ready responses.

```
Your Sites → Umami (collection + dashboard) → Pulse Agent API → AI agents (Finn, Claude, etc.)
```

## Features

- **One-line tracker** — one `<script>` tag per site, hosted on your own domain
- **Privacy-first** — Umami is cookie-free and GDPR-compliant out of the box
- **Agent API** — REST endpoints that return `summary` + `context_for_agent` fields ready to drop into a reply
- **Natural language queries** — `POST /v1/query` with `{ domain, question }` in plain English
- **Anomaly detection** — z-score based spike/drop detection across your traffic history
- **Multi-site** — one Umami instance tracks unlimited sites

## Stack

| Layer | Tech |
|-------|------|
| Tracker + Dashboard | [Umami](https://umami.is) (self-hosted, Docker) |
| Database | Postgres |
| Agent API | Node.js + Fastify + TypeScript |
| Hosting | [Railway](https://railway.app) |

## Agent API Endpoints

```
GET  /health
GET  /v1/sites
GET  /v1/sites/:id/metrics?period=7d
GET  /v1/sites/:id/insights
GET  /v1/sites/:id/anomalies
POST /v1/query   { domain, question }
```

### Example query

```bash
curl -X POST https://your-api.domain.com/v1/query \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"yoursite.com","question":"top trending pages this week?"}'
```

```json
{
  "summary": "yoursite.com — this week: 1,243 pageviews (+34% vs prior), 891 visitors (+28%), 42% bounce rate.",
  "data": { "topPages": [...], "stats": {...} },
  "context_for_agent": "yoursite.com had 1,243 pageviews this week — +34% vs the prior period. Top page: /pricing (312 views)."
}
```

## Self-hosting

### Local dev

```bash
cp .env.example .env   # fill in DB_PASSWORD and APP_SECRET
docker compose up -d   # Umami at http://localhost:3000
```

Default Umami login: `admin` / `umami` — change immediately.

### Deploy to Railway

1. Fork this repo
2. Create a new Railway project
3. Add a Postgres database
4. Deploy the `agent-api/` service — set these env vars:

```
UMAMI_BASE_URL=https://your-umami.up.railway.app
UMAMI_USERNAME=admin
UMAMI_PASSWORD=your_password
PULSE_API_KEYS=your_secret_key
PORT=3000
```

5. Add one tracker line to each site's `<head>`:

```html
<script defer src="https://your-umami-domain.com/script.js"
        data-website-id="SITE_ID_FROM_UMAMI"></script>
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `UMAMI_BASE_URL` | URL of your Umami instance |
| `UMAMI_USERNAME` | Umami admin username |
| `UMAMI_PASSWORD` | Umami admin password |
| `PULSE_API_KEYS` | Comma-separated bearer tokens for API access |
| `PORT` | Server port (default 3000) |

## Wiring to an AI agent

Any agent with HTTP tool access can query Pulse. The `context_for_agent` field in every response is pre-formatted for direct use in a reply — no further processing needed.

Example agent prompt addition:
> You have access to a `pulse_query(domain, question)` tool. Use it whenever the user asks about website traffic, analytics, or how a site is performing.

## License

MIT
