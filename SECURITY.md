# Security policy

## Supported versions

Only the latest release of Pulse, and the `main` branch, get security fixes.

| Version | Supported |
|---|---|
| 0.1.x (latest) | Yes |
| Older | No |

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. If that is not available to you, email tyler@szakacsmedia.com.

Please include:

- What you found and what an attacker could do with it.
- Steps to reproduce.
- Your Pulse version or commit, and how you run it.

You can expect a first reply within a few days. Pulse is maintained by one person, so a fix may take longer, but you will get updates. Once a fix is released we will credit you in the changelog unless you prefer to stay anonymous.

## Sensitive surface

Pulse holds your Umami admin login and answers requests with your analytics data. These areas matter most:

- **Authentication.** Any bug that lets a request without a valid key reach a `/v1/*` route.
- **Credentials.** Any path that logs or returns `UMAMI_PASSWORD`, an Umami token or an API key.
- **Reach.** The API reads every site in the Umami account it logs in with. A leaked API key exposes all of them.

Deploy notes: run the API behind HTTPS, use long random keys in `PULSE_API_KEYS`, give each agent its own key, and change the default Umami login (`admin` / `umami`) on first start.
