# Pulse

**Web analytics for personal AI agents.** Self-hosted [Umami](https://umami.is) for collection and dashboarding, plus a Fastify API layer that returns analytics in plain English — built so agents like Hermes, OpenClaw, or any custom server-hosted agent can answer "how did my site do this week?" with real data.

> Built for people running their own agents on their own servers.

**Live demo API:** `https://agent-api-production-620c.up.railway.app`

---

## Context (read this first)

If you run a personal AI agent (Hermes, OpenClaw, a custom Claude setup, etc.), you probably want it to know how your websites are performing. The problem: analytics platforms return raw time-series data that agents have to interpret themselves, and most don't have MCP servers or agent-ready APIs.

Pulse solves this with two components:
1. **Umami** — handles the tracker script, sessions, pageview storage, GDPR compliance, and the visual dashboard. Drop in one `<script>` tag per site and forget about it.
2. **Pulse Agent API** (`agent-api/`) — a Fastify + TypeScript service that wraps Umami's REST API. Every response includes a `context_for_agent` string your agent can use directly in a reply. No post-processing needed.

The primary integration path is **MCP** — a ~150-line Python stdio server (see [Wiring to an Agent](#wiring-to-an-agent)) that plugs into any MCP-compatible agent framework. Your agent gets three tools: `pulse_query` (natural language), `pulse_metrics` (structured data), and `pulse_list_sites`.

### Why Umami instead of building a custom collector?
Umami solves the hard parts: GDPR-compliant cookie-free tracking, session de-duplication, bot filtering, and a production-ready dashboard. The differentiation in Pulse is the **Agent API layer**, not data collection. Building a custom collector would take months and produce a worse result.

### Why Fastify instead of Express?
Fastify is ~2x faster than Express for JSON-heavy APIs and has first-class TypeScript support. For an API that agents call frequently, it matters.

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

### Deploy anywhere (Docker)

The entire stack — Postgres, Umami, and the Agent API — runs from a single `docker compose up`. This works on any host that supports Docker: a VPS, a cloud VM, a managed container platform, whatever you prefer.

```bash
git clone https://github.com/tszaks/pulse
cd pulse
cp .env.example .env
# Fill in .env (see Environment Variables section)

docker compose up -d
```

Services after startup:
- Umami dashboard → `http://your-host:3000`
- Pulse Agent API → `http://your-host:3001`

The `agent-api` container waits for Umami to pass its health check before starting, so boot order is handled automatically.

**Connecting to a managed Postgres instead of the bundled one:**
Remove the `postgres` and `agent-api` `depends_on` entries from `docker-compose.yml`, remove the `postgres` service entirely, and set `DATABASE_URL` directly on the `umami` service pointing to your external database.

**Reverse proxy (recommended for production):**
Put Nginx or Caddy in front of both services. Point your analytics domain at port 3000 and your API domain at port 3001. Caddy handles SSL automatically via Let's Encrypt.

```
# Minimal Caddyfile example
pulse.yourdomain.com {
    reverse_proxy localhost:3000
}
api.pulse.yourdomain.com {
    reverse_proxy localhost:3001
}
```

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

## Wiring to an Agent

Pulse is built for personal agents running on their own servers — the kind that load MCP tools from a config file and can call HTTP endpoints. Here's how to connect it.

### MCP (recommended)

If your agent supports MCP (Hermes, OpenClaw, Claude Code, etc.), add `pulse/index.py` as an MCP server. It exposes three tools: `pulse_query`, `pulse_list_sites`, and `pulse_metrics`.

Create the file on your agent's server:

```python
#!/usr/bin/env python3
import sys, json, urllib.request

PULSE_BASE = "https://your-api-domain.com"
PULSE_KEY  = "your_api_key"
HEADERS = {"Authorization": f"Bearer {PULSE_KEY}", "Content-Type": "application/json"}

TOOLS = [
    {
        "name": "pulse_query",
        "description": "Query web analytics in plain English. Ask things like 'how did marpenutrition.com do this week?' or 'top pages on szakacsmedia.com this month?'. Returns a reply-ready summary.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "domain": {"type": "string", "description": "Domain to query, e.g. yoursite.com"},
                "question": {"type": "string", "description": "Natural language analytics question"}
            },
            "required": ["domain", "question"]
        }
    },
    {
        "name": "pulse_list_sites",
        "description": "List all websites being tracked.",
        "inputSchema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "pulse_metrics",
        "description": "Get structured metrics for a site.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "domain": {"type": "string"},
                "period": {"type": "string", "enum": ["1d","7d","30d","90d"], "default": "7d"}
            },
            "required": ["domain"]
        }
    }
]

def call(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(PULSE_BASE + path, data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def handle(name, args):
    if name == "pulse_list_sites":
        sites = call("GET", "/v1/sites")["sites"]
        return {"content": [{"type": "text", "text": "\n".join(f"- {s['domain']}" for s in sites)}]}
    if name == "pulse_query":
        r = call("POST", "/v1/query", {"domain": args["domain"], "question": args["question"]})
        return {"content": [{"type": "text", "text": r.get("context_for_agent") or r.get("summary")}]}
    if name == "pulse_metrics":
        sites = call("GET", "/v1/sites")["sites"]
        site = next((s for s in sites if s["domain"] == args["domain"]), None)
        if not site: return {"content": [{"type": "text", "text": f"Site {args['domain']} not found."}]}
        r = call("GET", f"/v1/sites/{site['id']}/metrics?period={args.get('period','7d')}")
        return {"content": [{"type": "text", "text": r.get("context_for_agent") or r.get("summary")}]}

for line in sys.stdin:
    if not line.strip(): continue
    try:
        req = json.loads(line)
        method, rid = req.get("method"), req.get("id")
        if method == "initialize":
            resp = {"jsonrpc":"2.0","id":rid,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"pulse","version":"1.0.0"}}}
        elif method == "tools/list":
            resp = {"jsonrpc":"2.0","id":rid,"result":{"tools":TOOLS}}
        elif method == "tools/call":
            resp = {"jsonrpc":"2.0","id":rid,"result":handle(req["params"]["name"],req["params"].get("arguments",{}))}
        elif method and method.startswith("notifications/"): continue
        else:
            resp = {"jsonrpc":"2.0","id":rid,"error":{"code":-32601,"message":"Method not found"}}
        print(json.dumps(resp), flush=True)
    except Exception as e:
        print(json.dumps({"jsonrpc":"2.0","id":None,"error":{"code":-32700,"message":str(e)}}), flush=True)
```

Register it in your agent's config (example for Hermes `config.yaml`):
```yaml
mcp_servers:
  pulse:
    command: python3
    args:
      - /path/to/pulse/index.py
```

Restart your agent. It will now have `pulse_query`, `pulse_list_sites`, and `pulse_metrics` available as tools.

### Direct HTTP

Any agent that can make HTTP requests works too. The `POST /v1/query` endpoint is the simplest entry point:

```
POST /v1/query
Authorization: Bearer YOUR_KEY
{ "domain": "yoursite.com", "question": "how did we do this week?" }

→ { "context_for_agent": "yoursite.com had 1,243 pageviews this week — +34%..." }
```

Add the `context_for_agent` field to your agent's system context or reply directly with its value.

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
