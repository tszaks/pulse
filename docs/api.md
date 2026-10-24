# API reference

The Pulse Agent API is a small Fastify service in `agent-api/`. It reads from your Umami instance and returns answers in a fixed shape. It is read-only: it never writes to Umami.

## Conventions

**Authentication.** Every `/v1/*` route needs `Authorization: Bearer <key>`. A key is valid if it appears in the `PULSE_API_KEYS` environment variable. A missing or wrong key returns `401` with `{"error": "Invalid or missing API key"}`. `GET /health` needs no key.

**Rate limit.** 60 requests per minute (the `@fastify/rate-limit` default key, which is the client IP). CORS is enabled with the plugin defaults.

**Periods.** Where a route takes `period`, the allowed values are `1d`, `7d`, `14d`, `30d` and `90d`. The default is `7d`. Any other value returns `400` with `{"error": "period must be 1d, 7d, 14d, 30d, 90d"}`.

**Response shape.** Data routes return:

| Field | Meaning |
|---|---|
| `summary` | One short line for humans. |
| `data` | The numbers, as JSON. |
| `context_for_agent` | A plain-English paragraph an agent can quote or paste into a reply. |

`POST /v1/query` also returns `intent` and `period`, the values it settled on.

All examples below use `example.com` and made-up numbers.

## Routes

### GET /health

No key needed.

```json
{ "ok": true, "service": "pulse-agent-api" }
```

### GET /v1/sites

Lists the websites in your Umami instance (up to 100).

```json
{
  "sites": [
    { "id": "00000000-0000-0000-0000-000000000000", "name": "Example", "domain": "example.com" }
  ]
}
```

Use the `id` in the routes below.

### GET /v1/sites/:id/metrics

Query: `period`. Returns pageviews, visitors, visits, bounce rate, top pages and top referrers (10 each).

```json
{
  "summary": "example.com — this week: 1,243 pageviews (+34% vs prior period), 891 unique visitors (+28%), 42% bounce rate.",
  "data": {
    "period": "7d",
    "domain": "example.com",
    "pageviews": 1243,
    "visitors": 891,
    "visits": 950,
    "bounceRate": 42,
    "topPages": [{ "x": "/pricing", "y": 312 }],
    "topReferrers": [{ "x": "google.com", "y": 145 }]
  },
  "context_for_agent": "example.com had 1,243 pageviews this week — +34% compared to the previous period. 891 unique visitors, 42% bounce rate. ..."
}
```

Umami v3 returns a flat stats object with a `comparison` sub-object (not the `{value, prev}` shape from the v2 docs). The types in `agent-api/src/types.ts` follow v3.

### GET /v1/sites/:id/insights

One call that combines 7-day and 30-day stats, the top 5 pages and the top 5 referrers (7-day). No `period` parameter.

### GET /v1/sites/:id/anomalies

Looks at the last 30 days of daily pageviews. A day is flagged when its z-score is 2.0 or more away from the mean. Needs at least 7 data points. Results are sorted by size of the z-score.

```json
{
  "summary": "...",
  "data": {
    "domain": "example.com",
    "anomalies": [
      { "date": "2026-05-03", "value": 892, "expected": 245, "zScore": 3.2, "direction": "spike" }
    ],
    "seriesLength": 30
  },
  "context_for_agent": "..."
}
```

### GET /v1/sites/:id/active

How many visitors are on the site right now (Umami's active-visitors count).

### GET /v1/sites/:id/breakdown

Query: `type` and `period`.

| `type` | Groups by |
|---|---|
| `country` (default) | Country |
| `city` | City |
| `browser` | Browser |
| `os` | Operating system |
| `device` | Device type |
| `event` | Custom event name |

An unknown `type` returns `400` with the allowed list.

### GET /v1/sites/:id/time

Query: `period`. Average session length. `data` holds `totaltime`, `visits` and `avgSeconds`.

### POST /v1/query

The main entry point for agents. Send a question; Pulse picks the route.

```json
{
  "domain": "example.com",
  "question": "what pages are trending this week?"
}
```

Use `site_id` instead of `domain` if you have the Umami site ID. If neither matches a site, the answer is `404`. If `question` is missing, the answer is `400`.

Optional `parsed`: `{ "intent": "geo", "period": "30d" }`. If you send it, Pulse skips its own keyword parser and uses your values. This lets your agent's own model resolve a hard question first.

#### How questions are parsed

The parser is keyword matching (see `agent-api/src/lib/nl-parser.ts`). It does not use a language model. The first matching pattern wins.

Period patterns:

| Phrase contains | Period |
|---|---|
| "today", "24h", "last day" | `1d` |
| "this week", "7 days", "past week", "last week" | `7d` |
| "2 weeks", "two weeks", "14 days", "fortnight" | `14d` |
| "this month", "30 days", "past month", "last month" | `30d` |
| "3 months", "90 days", "quarter" | `90d` |
| nothing matches | `7d` |

Intent patterns:

| Phrase contains | Intent | Answers with |
|---|---|---|
| "top page", "best page", "most visit", "trending page", "popular page" | `top_pages` | Top pages |
| "referr", "where ... from", "traffic source", "came from" | `referrers` | Top referrers |
| "anomal", "spike", "drop", "unusual", "weird", "strange" | `anomalies` | 30-day anomaly check |
| "countr", "city", "geo", "location", "region" | `geo` | Countries |
| "device", "mobile", "desktop", "tablet", "browser", "chrome", "safari", "firefox", "os", "operating" | `device` | Devices, browsers, operating systems |
| "active", "right now", "live", "online", "currently" | `active` | Visitors now |
| "how long", "time on", "session time", "average time", "dwell" | `time` | Average session time |
| "event", "click", "button", "form", "submit", "custom" | `events` | Custom events |
| "insight", "summar", "overview", "how did", "how doing", "performance" | `insights` | Overview |
| nothing matches | `overview` | Overview |

`insights` and `overview` both return the overview: stats plus the top 5 pages and referrers for the period. Patterns are checked in the order shown, so "top pages by country" is `top_pages`.

## Errors

| Status | When |
|---|---|
| `400` | Bad `period` or `type`, or no `question`. |
| `401` | Missing or wrong API key. |
| `404` | `POST /v1/query` could not find the site. |
| `429` | Rate limit hit. |
| `500` | Umami login failed or Umami returned an error. |

On a fresh Umami install with no data, the top pages, referrers and breakdown calls return empty lists instead of failing.
