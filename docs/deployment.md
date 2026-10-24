# Deployment

Pulse runs as three containers: Postgres, Umami and the Pulse Agent API. `docker-compose.yml` starts all three. Any host that runs Docker works: a VPS, a cloud VM or a managed container platform.

## Ports

| Service | Inside the container | On the host (compose) |
|---|---|---|
| Umami dashboard | 3000 | 3000 |
| Pulse Agent API | 3000 (`PORT`) | 3001 |

When you run the Agent API outside compose, it listens on `PORT`, which defaults to `3000`. That is the same port as Umami in the local setup, so set `PORT=3001` (see the README quick start).

## With docker compose

```sh
git clone https://github.com/tszaks/pulse.git
cd pulse
cp .env.example .env
# Edit .env: DB_PASSWORD, APP_SECRET, UMAMI_PASSWORD, PULSE_API_KEYS
docker compose up -d
```

Set `UMAMI_PASSWORD` to the password you will set in Umami. A fresh Umami install has the default login `admin` / `umami`. Log in at `http://your-host:3000` and change the password at once. Then make `UMAMI_PASSWORD` in `.env` match, and restart the API: `docker compose up -d agent-api`.

The `agent-api` container waits for the Umami health check before it starts. On first boot Umami runs its database migrations, which can take 10 to 15 seconds.

## Use your own Postgres

Remove the `postgres` service from `docker-compose.yml`, remove `postgres` from the `depends_on` of `umami`, and set `DATABASE_URL` on the `umami` service to your database.

## Reverse proxy

Put Nginx or Caddy in front of both services for TLS. Point your analytics domain at port 3000 and your API domain at port 3001. A minimal Caddyfile:

```
umami.example.com {
    reverse_proxy localhost:3000
}
api.example.com {
    reverse_proxy localhost:3001
}
```

Keep the Agent API behind HTTPS. Its only protection is the bearer key.

## Add the tracker to a site

Add this to the `<head>` of every page you want to track:

```html
<script defer
  src="https://umami.example.com/script.js"
  data-website-id="SITE_UUID_FROM_UMAMI">
</script>
```

In a Next.js App Router layout:

```tsx
import Script from 'next/script'
// Inside <body>:
<Script defer src="https://umami.example.com/script.js"
  data-website-id="SITE_UUID" strategy="afterInteractive" />
```

Find the `data-website-id` in Umami under Websites, then Edit.

## Troubleshooting

**The metrics routes return empty lists on a new install.** Umami v3 answers 400 on its metrics endpoint when a period has no data. Pulse turns that into an empty list. Wait for traffic.

**`+∞%` in a comparison.** Both the current and the previous period are 0. This is expected on a new site.

**A host marks the deploy failed because the health check is slow.** Umami needs 10 to 15 seconds on first boot to run migrations. Raise the health check timeout.

**`Umami login failed` or a 500.** `UMAMI_USERNAME` or `UMAMI_PASSWORD` does not match Umami, or `UMAMI_BASE_URL` is wrong. Pulse logs in once and caches the token for 22 hours. Umami tokens last 24 hours.

**`Unauthorized` from the Railway CLI on `railway add --database`.** The original author hit this on Railway CLI v4.x and worked around it with Railway's GraphQL API (`serviceCreate` with `source: { image: "postgres:15-alpine" }`). It has not been re-checked on a current CLI.
