# Pulse

**Agent-native web analytics.** Self-hosted [Umami](https://umami.is) for collection and dashboarding, plus a Fastify API layer that returns analytics in plain English — designed for AI agents, not dashboards.

> "How did my site do this week?" → real answer, no dashboard required.

**Live demo API:** `https://agent-api-production-620c.up.railway.app`

---

## Context (read this first)

Most analytics platforms have APIs, but they return raw time-series data that agents have to interpret themselves. Pulse wraps Umami with an opinionated layer that shapes every response for LLM consumption: each endpoint returns a human-readable `summary`, structured `data`, and a pre-written `context_for_agent` string you can drop directly into a reply.

This project is two things running together:
1. **Umami** — handles the tracker script, sessions, pageview storage, GDPR compliance, and the visual dashboard. You don't need to touch it after setup.
2. **Pulse Agent API** (`agent-api/`) — a Fastify + TypeScript service that wraps Umami's REST API and adds: agent-shaped responses, WoW comparisons, z-score anomaly detection, and a natural-language query endpoint.

### Why Umami instead of building a custom collector?
Umami solves the hard parts: GDPR-compliant cookie-free tracking, session de-duplication, bot filtering, and a production-ready dashboard. The differentiation in Pulse is the **Agent API layer**, not data collection. Building a custom collector would take months and produce a worse result.

### Why Fastify instead of Express?
Fastify is ~2x faster than Express for JSON-heavy APIs and has first-class TypeScript support and schema validation built in. For an API that agents will hammer with requests, it matters.

---

## Architecture

```
Your Sites
  └─ <script defer src="https://your-umami.com/script.js" data-website-id="...">
          │
          ▼
Umami (Docker on Railway)
  ├─ Collects pageviews, sessions, events
  ├─ Stores in Postgres
  └─ Exposes REST API at /api/...
          │
          ▼
Pulse Agent API (Node.js/Fastify on Railway)
  ├─ Authenticates with Umami via /api/auth/login (token cached 22h)
  ├─ Wraps Umami endpoints with LLM-friendly response shapes
  ├─ Adds anomaly detection (z-score on 30-day pageview series)
  └─ Exposes /v1/query for natural-language requests
          │
          ▼
AI Agents (Finn, Claude, any HTTP client)
  └─ Ask questions, get narrated answers
```

---

## File Map

```
Pulse/
├── docker-compose.yml          # Local dev: runs Umami + Postgres together
├── .env.example                # All required env vars with descriptions
│
└── agent-api/
    ├── Dockerfile              # Node 20-alpine, npm ci, tsc, node dist/server.js
    ├── package.json
    ├── tsconfig.json           # CommonJS target, ES2022, strict mode
    │
    └── src/
        ├── server.ts           # Fastify app setup, plugin registration, listen()
        ├── types.ts            # All shared TypeScript interfaces (UmamiStats, Anomaly, etc.)
        │
        ├── lib/
        │   ├── umami-client.ts # All Umami API calls. Token cache lives here. Edit this to add new Umami endpoints.
        │   ├── auth.ts         # Bearer token validation against PULSE_API_KEYS env var
        │   ├── llm-formatter.ts# Converts raw Umami data → {summary, context_for_agent}. Edit this to change response wording.
        │   ├── anomaly.ts      # Z-score anomaly detection. Threshold is 2.0 (configurable).
        │   └── nl-parser.ts    # Keyword-based NL→query parser. Maps phrases to intent + period.
        │
        └── routes/
            ├── health.ts       # GET /health → {ok: true}
            ├── sites.ts        # GET /v1/sites → list of tracked sites
            ├── metrics.ts      # GET /v1/sites/:id/metrics?period=7d
            ├── insights.ts     # GET /v1/sites/:id/insights (combines week + month + top pages)
            ├── anomalies.ts    # GET /v1/sites/:id/anomalies (last 30 days)
            └── query.ts        # POST /v1/query {domain, question} — main agent entry point
```

**Where to make common changes:**
- Add a new metric type → `umami-client.ts` (add fetch function) + new route file + register in `server.ts`
- Change response wording → `llm-formatter.ts`
- Add a new intent to natural language parsing → `nl-parser.ts` (add pattern to `INTENT_PATTERNS`)
- Change anomaly sensitivity → `anomaly.ts`, adjust `threshold` default (lower = more sensitive)
- Add a new API key → append to `PULSE_API_KEYS` env var, comma-separated

---

## API Reference

**Authentication:** All `/v1/*` routes require `Authorization: Bearer YOUR_KEY` header.

### GET /health
No auth required. Returns `{"ok": true, "service": "pulse-agent-api"}`.

---

### GET /v1/sites
Returns all sites registered in your Umami instance.

**Response:**
```json
{
  "sites": [
    { "id": "36bed286-...", "name": "Szakacsmedia.com", "domain": "szakacsmedia.com" }
  ]
}
```

---

### GET /v1/sites/:id/metrics
Query params: `period` = `1d` | `7d` | `30d` | `90d` (default `7d`)

**Response shape:**
```json
{
  "summary": "szakacsmedia.com — this week: 1,243 pageviews (+34%), 891 visitors (+28%), 42% bounce rate.",
  "data": {
    "period": "7d",
    "domain": "szakacsmedia.com",
    "pageviews": 1243,
    "visitors": 891,
    "visits": 950,
    "bounceRate": 42,
    "topPages": [{"x": "/pricing", "y": 312}, ...],
    "topReferrers": [{"x": "google.com", "y": 145}, ...]
  },
  "context_for_agent": "szakacsmedia.com had 1,243 pageviews this week — +34% vs prior period. 891 unique visitors, 42% bounce rate. Top pages: 1. /pricing (312 views)..."
}
```

**Note on Umami v3:** The stats endpoint returns a flat structure with a `comparison` sub-object (not the `{value, prev}` shape from v2 docs). The types in `types.ts` reflect the v3 format.

---

### GET /v1/sites/:id/insights
Pre-computed report combining 7-day + 30-day stats, top pages, and top referrers in one call.

---

### GET /v1/sites/:id/anomalies
Runs z-score detection on the last 30 days of daily pageviews. Returns anomalies sorted by severity.

**Response:**
```json
{
  "summary": "2 anomalies detected for szakacsmedia.com. Biggest: spike on 2026-05-03...",
  "data": {
    "anomalies": [
      { "date": "2026-05-03", "value": 892, "expected": 245, "zScore": 3.2, "direction": "spike" }
    ]
  },
  "context_for_agent": "szakacsmedia.com had a traffic spike on 2026-05-03: 892 pageviews vs the expected ~245."
}
```

---

### POST /v1/query
**The main agent entry point.** Accepts a natural language question and routes it to the right endpoint.

**Request:**
```json
{
  "domain": "marpenutrition.com",
  "question": "what pages are trending this week?"
}
```
Alternatively use `site_id` instead of `domain`.

**Supported question patterns:**
| Pattern | Routes to |
|---------|-----------|
| "today", "last 24h" | period=1d |
| "this week", "7 days", "last week" | period=7d |
| "this month", "30 days" | period=30d |
| "top pages", "trending", "most visited" | intent=top_pages |
| "referrer", "where from", "traffic source" | intent=referrers |
| "anomaly", "spike", "drop", "unusual" | intent=anomalies |
| "how did we do", "overview", "insights" | intent=insights |
| Default (no match) | overview with top pages + referrers |

**Response:** Same `{summary, data, context_for_agent, parsed}` shape as other endpoints.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `UMAMI_BASE_URL` | Yes | Full URL to your Umami instance, e.g. `https://umami.yourdomain.com` |
| `UMAMI_USERNAME` | Yes | Umami admin username (default: `admin`) |
| `UMAMI_PASSWORD` | Yes | Umami admin password |
| `PULSE_API_KEYS` | Yes | Comma-separated bearer tokens agents will use, e.g. `key1,key2` |
| `PORT` | No | Server port (default: `3000`) |

**Umami-specific (for docker-compose local dev):**

| Variable | Description |
|----------|-------------|
| `DB_PASSWORD` | Postgres password for local dev |
| `APP_SECRET` | Umami session secret — generate with `openssl rand -hex 32` |
| `DATABASE_URL` | Set automatically in Railway; for local = `postgresql://umami:PASSWORD@postgres:5432/umami` |

---

## Setup

### Local dev

```bash
git clone https://github.com/tszaks/pulse
cd pulse
cp .env.example .env
# Edit .env: set DB_PASSWORD and run: openssl rand -hex 32 for APP_SECRET

docker compose up -d
# Umami dashboard → http://localhost:3000  (admin / umami — change immediately)

cd agent-api
npm install
UMAMI_BASE_URL=http://localhost:3000 UMAMI_USERNAME=admin UMAMI_PASSWORD=your_new_password PULSE_API_KEYS=testkey npm run dev
# Agent API → http://localhost:3001
```

### Deploy to Railway

1. Fork this repo
2. In Railway: New Project → Empty project
3. Add a **Postgres** database service
4. Add a new service → Deploy from GitHub repo → select `pulse` → **Root directory: `/`** → uses the Umami Docker image
   - Set env vars: `DATABASE_URL` (from Railway Postgres), `APP_SECRET` (openssl rand -hex 32)
5. Add a second service → Deploy from GitHub repo → select `pulse` → **Root directory: `agent-api/`**
   - Set env vars: `UMAMI_BASE_URL`, `UMAMI_USERNAME`, `UMAMI_PASSWORD`, `PULSE_API_KEYS`
6. Add custom domains to both services

### Add tracker to a site

In any HTML `<head>` (Astro, Next.js, vanilla):
```html
<script defer
  src="https://your-umami-domain.com/script.js"
  data-website-id="SITE_UUID_FROM_UMAMI">
</script>
```

For **Next.js App Router** (`layout.tsx`):
```tsx
import Script from 'next/script'
// Inside <body>:
<Script defer src="https://your-umami-domain.com/script.js"
  data-website-id="SITE_UUID" strategy="afterInteractive" />
```

Get the `data-website-id` from Umami → Websites → Edit.

---

## Wiring to an AI Agent

Any agent with HTTP tool access works. Add this to its system prompt or tool definition:

```
You have access to a pulse_query tool that queries web analytics.
Call it with { domain: "yoursite.com", question: "natural language question" }.
The response includes a context_for_agent field — use that text directly in your reply.
Available domains: [list your domains here]
```

For **MCP-compatible agents**, the Pulse API can be wrapped as an MCP server using the same stdio pattern as the namecheap MCP. A `pulse_query`, `pulse_list_sites`, and `pulse_metrics` tool covers all use cases.

---

## Troubleshooting

**Metrics endpoint returns 400**
Umami v3 returns 400 on the `/metrics` endpoint when there is no data for the requested period. This is expected behavior on a fresh install. The API handles this gracefully and returns an empty array. Wait for real traffic to flow in.

**`+∞%` in comparisons**
Appears when both current and previous period are 0 (fresh site, no data yet). Not a bug.

**Umami takes 10-15 seconds to start**
On first boot, Umami runs all Prisma migrations. Subsequent starts are fast. If Railway marks the deploy as failed due to a slow health check, increase the health check timeout.

**`Unauthorized` errors from Railway CLI on `railway add --database`**
Known bug in Railway CLI v4.x. Use the Railway GraphQL API directly (`POST https://backboard.railway.app/graphql/v2`) with the `serviceCreate` mutation and `source: { image: "postgres:15-alpine" }` instead.

**Token expired errors**
Umami tokens expire after 24h. The `umami-client.ts` caches the token for 22h and re-authenticates automatically. If you see auth errors, restart the agent-api service.

---

## License

MIT
