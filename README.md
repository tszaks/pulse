<h1 align="center">Pulse</h1>

<p align="center">
  Web analytics for personal AI agents: self-hosted Umami, plus an API that answers in plain English.
</p>

<p align="center">
  <a href="https://github.com/tszaks/pulse/actions/workflows/ci.yml"><img src="https://github.com/tszaks/pulse/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/tszaks/pulse/releases"><img src="https://img.shields.io/github/v/tag/tszaks/pulse" alt="Latest tag"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/tszaks/pulse" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/Node-20%2B-339933" alt="Node 20 or later">
</p>

```sh
curl -s https://api.example.com/v1/query \
  -H "Authorization: Bearer $PULSE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", "question": "how did we do this week?"}'
```

```json
{
  "summary": "example.com — this week: 1,243 pageviews (+34% vs prior period), 891 unique visitors (+28%), 42% bounce rate.",
  "context_for_agent": "example.com had 1,243 pageviews this week — +34% compared to the previous period. 891 unique visitors, 42% bounce rate. Top pages on example.com this week: 1. /pricing (312 views) ...",
  "intent": "insights",
  "period": "7d"
}
```

If you run a personal AI agent (Hermes, OpenClaw, a custom Claude setup), you probably want it to know how your websites are doing. Analytics tools return raw time series that the agent has to interpret, and most have no agent-ready API. Pulse closes that gap for people who run their own agents on their own servers.

It has two parts. [Umami](https://umami.is) collects pageviews and sessions and gives you a dashboard. The Pulse Agent API (`agent-api/`) is a Fastify and TypeScript service that wraps Umami's REST API. Every answer includes a `context_for_agent` string that the agent can quote in a reply with no extra processing.

## Features

- **Plain-English answers.** Every response has a `summary` for humans and a `context_for_agent` paragraph for the agent.
- **Ask in a sentence.** `POST /v1/query` takes a question such as "what pages are trending this week?" and picks the right report with a keyword parser. Your agent can send its own `parsed` intent to skip the parser.
- **Reports for the common questions.** Metrics, top pages, referrers, countries, cities, browsers, operating systems, devices, custom events, average session time and visitors right now.
- **Anomaly detection.** Flags spikes and drops in 30 days of daily pageviews with a z-score check.
- **One stack, one command.** `docker compose up` starts Postgres, Umami and the API.
- **Bearer-key auth and rate limit.** One or more API keys, 60 requests per minute.
- **Umami does the hard part.** Cookie-free tracking, session handling and the dashboard come from Umami, not from a custom collector.

## Quick start

You need Docker and Node 20 or later.

```sh
git clone https://github.com/tszaks/pulse.git
cd pulse
cp .env.example .env
# Edit .env. Set DB_PASSWORD, and APP_SECRET (generate one with: openssl rand -hex 32)

docker compose up -d postgres umami
```

This starts Postgres and the Umami dashboard at `http://localhost:3000`. A new Umami install has the login `admin` / `umami`. Log in and change the password now. Add your site there and copy its website ID.

Run the Agent API on port 3001, using the new Umami password:

```sh
cd agent-api
npm install
UMAMI_BASE_URL=http://localhost:3000 \
UMAMI_USERNAME=admin \
UMAMI_PASSWORD=your_new_password \
PULSE_API_KEYS=testkey \
PORT=3001 \
npm run dev
```

Check it:

```sh
curl http://localhost:3001/health
curl -H "Authorization: Bearer testkey" http://localhost:3001/v1/sites
```

To run the API in Docker instead of with `npm`, set `UMAMI_PASSWORD` and `PULSE_API_KEYS` in `.env` and run `docker compose up -d`. That starts all three services, with the API on port 3001. See [docs/deployment.md](docs/deployment.md) for production notes, a reverse proxy example and how to add the tracker script to a site.

## Usage

Ask a question:

```sh
curl -s http://localhost:3001/v1/query \
  -H "Authorization: Bearer testkey" \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", "question": "top pages this month?"}'
```

| Route | What it returns |
|---|---|
| `GET /health` | `{"ok": true}`. No key needed. |
| `GET /v1/sites` | Sites in your Umami instance. |
| `GET /v1/sites/:id/metrics?period=7d` | Pageviews, visitors, bounce rate, top pages and referrers. |
| `GET /v1/sites/:id/insights` | 7-day and 30-day summary in one call. |
| `GET /v1/sites/:id/anomalies` | Spikes and drops in the last 30 days. |
| `GET /v1/sites/:id/active` | Visitors on the site right now. |
| `GET /v1/sites/:id/breakdown?type=country&period=7d` | Breakdown by `country`, `city`, `browser`, `os`, `device` or `event`. |
| `GET /v1/sites/:id/time?period=7d` | Average session time. |
| `POST /v1/query` | Natural-language entry point for agents. |

`period` is one of `1d`, `7d`, `14d`, `30d`, `90d`. Every `/v1/*` route needs `Authorization: Bearer <key>`. Full request and response details, and the list of phrases the parser understands, are in [docs/api.md](docs/api.md).

## Configuration

The Agent API reads these environment variables.

| Variable | Required | Default | Description |
|---|---|---|---|
| `UMAMI_BASE_URL` | Yes | none | Full URL of your Umami instance, for example `https://umami.example.com`. |
| `UMAMI_USERNAME` | No | `admin` | Umami login name. |
| `UMAMI_PASSWORD` | Yes | none | Umami login password. |
| `PULSE_API_KEYS` | Yes | none | Comma-separated bearer keys that agents may use, for example `key1,key2`. With no keys set, every request to `/v1/*` is rejected. |
| `PORT` | No | `3000` | Port the API listens on. |

`docker-compose.yml` also reads these from `.env`.

| Variable | Description |
|---|---|
| `DB_PASSWORD` | Password for the bundled Postgres. |
| `APP_SECRET` | Umami secret. Generate one with `openssl rand -hex 32`. |

Compose sets `UMAMI_BASE_URL` for the API itself (`http://umami:3000`). Pulse logs in to Umami once, caches the token for 22 hours and logs in again on its own.

## Made for AI agents

Pulse is built for agents that run on your own server and load tools from a config file, or that can call HTTP endpoints.

- **MCP.** [docs/agents.md](docs/agents.md) has a small stdio MCP server you can copy. It gives your agent `pulse_query`, `pulse_list_sites` and `pulse_metrics`.
- **Plain HTTP.** Call `POST /v1/query` and use the `context_for_agent` field as the reply or as context.
- **Your model can help.** For a hard question, resolve the intent in your own model and send it as `parsed: {"intent": "geo", "period": "30d"}`.

Working on this code with an agent? Read [AGENTS.md](AGENTS.md).

## FAQ

**Does Pulse send data anywhere else?**
No. The Agent API talks to your Umami instance and nothing else. It adds no tracking of its own. What the tracker script collects is decided by Umami.

**Does Pulse change anything in Umami?**
No. It only reads. It logs in with the account you give it, so use an account you are fine with it reading.

**Why Umami and not a custom collector?**
Umami already handles the tracker script, sessions, bot filtering and a dashboard. The part that is missing for agents is an API they can read easily, so that is what Pulse adds.

**Is the keyword parser a language model?**
No. It matches phrases with regular expressions. If it guesses wrong, send your own `parsed` intent.

**How do I expose it on the internet?**
Put it behind HTTPS (see [docs/deployment.md](docs/deployment.md)). The bearer key is the only protection, so use long random keys.

## Contributing

Bug reports and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. Security problems go through [SECURITY.md](SECURITY.md). Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

Docs: [API reference](docs/api.md) · [agent guide](docs/agents.md) · [deployment](docs/deployment.md) · [changelog](CHANGELOG.md)

## License

[MIT](LICENSE) © 2026 Tyler Szakacs
