# Changelog

All notable changes to Pulse are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `14d` as an allowed `period` for the metrics, breakdown and time routes and for question parsing ("two weeks", "14 days", "fortnight").
- MIT `LICENSE`, contributing guide, security policy, code of conduct, issue and pull request templates, and a CI workflow that builds `agent-api`.
- Documentation: API reference, agent guide and deployment guide in `docs/`, and `AGENTS.md` for coding agents.

## [0.1.1] - 2026-05-10

### Added
- `GET /v1/sites/:id/active`: visitors on the site right now.
- `GET /v1/sites/:id/breakdown`: `country`, `city`, `browser`, `os`, `device` and `event` breakdowns.
- `GET /v1/sites/:id/time`: average session duration.
- `POST /v1/query` accepts an optional `parsed` field so an agent can send its own intent and period.

## [0.1.0] - 2026-05-10

First release.

### Added
- Pulse Agent API (Fastify and TypeScript) on top of the Umami REST API: sites, metrics, insights, anomalies and the natural-language `POST /v1/query`.
- Responses with `summary`, `data` and `context_for_agent`.
- Bearer-key authentication from `PULSE_API_KEYS`, and a rate limit of 60 requests per minute.
- Z-score anomaly detection on 30 days of daily pageviews.
- `docker-compose.yml` that runs Postgres, Umami and the Agent API together.

[Unreleased]: https://github.com/tszaks/pulse/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/tszaks/pulse/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tszaks/pulse/releases/tag/v0.1.0
