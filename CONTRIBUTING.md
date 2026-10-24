# Contributing to Pulse

Thanks for helping. Pulse is a small, read-only layer on top of Umami. The bar for changes is: does it stay **simple**, and does it make answers **easier for an agent to use**?

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- For bugs, open an issue with the template. Remove API keys, passwords and real site data first.
- For features, open an issue first and describe the problem you want to solve.
- Small fixes (typos, clear bugs) can go straight to a pull request.
- Security problems go through [SECURITY.md](SECURITY.md), not a public issue.

## Setup

You need Node 20 or later. Docker is optional, but it is the easiest way to get a local Umami.

```sh
git clone https://github.com/tszaks/pulse.git
cd pulse
cp .env.example .env          # set DB_PASSWORD and APP_SECRET
docker compose up -d postgres umami
cd agent-api
npm install
UMAMI_BASE_URL=http://localhost:3000 UMAMI_USERNAME=admin UMAMI_PASSWORD=your_password \
PULSE_API_KEYS=testkey PORT=3001 npm run dev
```

## Check your change

The project has no automated tests yet. Before you open a pull request, run the build, which type-checks everything in strict mode:

```sh
cd agent-api
npm ci
npm run build
```

Then call the routes you changed with `curl` against a local Umami and check the output. CI runs the same build.

## Code style

- **Match the surrounding code.** Same naming, same comment density, same idiom as the file you are editing. There is no formatter to run, so read the neighbors.
- TypeScript, strict mode, CommonJS output. Imports of local files use the `.js` suffix, as in the existing routes.
- Keep dependencies at a minimum. Do not add one without discussion.
- Every `/v1/*` route uses the `requireApiKey` pre-handler.

## Safety rules

- Pulse is read-only. Do not add a route that writes to Umami.
- Never log or return `UMAMI_PASSWORD`, an Umami token or an API key.
- Use `example.com` and made-up numbers in docs, tests and examples. No real site names, keys or URLs.

## Pull request checklist

- [ ] `npm run build` passes in `agent-api/`.
- [ ] The change is small and focused. Unrelated cleanups go in their own pull request.
- [ ] The code matches the surrounding style and adds no dependency.
- [ ] Docs updated if a route, env var or response shape changed (`README.md`, `docs/`).
- [ ] A line added under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.

## Using AI agents to contribute

Fine, as long as you read and understand what you submit and the checklist above is true. [AGENTS.md](AGENTS.md) tells coding agents how this repository works.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
