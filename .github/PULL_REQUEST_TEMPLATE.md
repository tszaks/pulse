## What and why

<!-- What does this change, and why? Link the issue if there is one. -->

## Checklist

- [ ] `cd agent-api && npm ci && npm run build` passes
- [ ] The code matches the surrounding code (TypeScript, strict mode, no new dependencies without discussion)
- [ ] Every new `/v1/*` route uses `requireApiKey`
- [ ] No keys, passwords or real site names in code, docs or examples (use `example.com`)
- [ ] Docs updated if a route, env var or response shape changed (`README.md`, `docs/`)
- [ ] A line added under `[Unreleased]` in CHANGELOG.md for anything a user would notice
