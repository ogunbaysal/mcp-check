# Contributing to mcp-probe

Thanks for considering a contribution. mcp-probe is deliberately small — please read the
"Scope" section below before proposing new features.

## Getting started

```bash
git clone https://github.com/ogunbaysal/mcp-check.git
cd mcp-check
npm install
npm test
```

`npm test` builds the CLI and the fixture MCP servers under `fixtures/*/dist`, then runs the full
unit + integration suite. That's the whole loop — if it's green, your environment is set up
correctly.

## Development workflow

- `npm run dev` — rebuilds on change and runs `mcp-probe --help`.
- `npm run test:watch` — vitest in watch mode.
- `npm run lint` / `npm run typecheck` / `npm run format` — run before opening a PR.
- `npm run build` — produces `dist/index.js` (the published CLI) and `fixtures/*/dist` (the fixture
  servers used by tests).

Before opening a PR, run the same checks CI runs:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Project layout

See the "Development" section of the [README](./README.md#development) for the module map. The
short version: `checks/*` perform I/O against a live MCP `Client`; `validation/*` are pure
functions over already-fetched data (tools/resources/prompts arrays) and have no knowledge of the
SDK's client/transport at all. Keep that split — it's what makes validation logic testable without
spawning a process.

## Adding a new check

1. If it's a new **validation rule** for an existing capability (tools/resources/prompts), add it
   to the relevant pure function in `src/validation/*.ts` and cover it with a unit test in
   `tests/unit/validation-*.test.ts`. A missing/invalid field should usually be an **error**
   (fails the run); a quality/hygiene issue (like a missing description) should be a **warning**
   unless it breaks the protocol.
2. If it's a genuinely new capability or connection-lifecycle check, add a `checks/<name>.ts`
   module following the existing pattern (`attempted`, `checks`, `warnings`, `errors`, optional
   `count`/`timingMs`), wire it into `src/core/run-check.ts`, and add both an id-stable
   `CheckItem` and, if it can fail, a `Diagnostic` code.
3. Never fail a run because a capability wasn't advertised — check `serverCapabilities.<x>` first
   and return `{ attempted: false, ... }` if it's absent.
4. Add a fixture under `fixtures/` if no existing one exercises the new behavior, and an
   integration test in `tests/integration/run-check.test.ts` that spawns it for real. Prefer real
   client/server communication over mocking the SDK.

## Tests

- **Unit tests** (`tests/unit`) cover pure logic: argument parsing, validation functions, exit-code
  decisions, and the renderers. They must not spawn processes.
- **Integration tests** (`tests/integration`) spawn real fixture MCP servers over real stdio
  (`run-check.test.ts`) and, for a few critical paths, the actual built `dist/index.js` binary as a
  subprocess (`cli.test.ts`). If you add a fixture server, compile it via `tsup.fixtures.config.ts`
  (add an entry) — don't hand-write a `dist/` file.
- Keep tests deterministic. Timeout tests use a short `--timeout` against a fixture configured to
  delay far longer than that, never a real network call or a guessed sleep on the assertion side.

## Scope

mcp-probe answers one question — "is my MCP server correctly implemented and ready to use?" — for
a single server over stdio or HTTP(S), from the command line. Before proposing a feature, check whether it
fits that. Explicitly out of scope for now: a web dashboard, a hosted service, an HTTP/SSE proxy,
automatic tool execution, LLM-based evaluation, a benchmarking suite, or persistent
history/tracing. `mcp-probe test` / `benchmark` / `inspect` subcommands and file-based
configuration are plausible future directions — the architecture doesn't block them — but aren't
implemented yet; please open an issue to discuss before building one.

## Release process

Publishing to npm is handled by `.github/workflows/release.yml`, triggered by pushing a version
tag. One-time setup: create an npm
[automation access token](https://docs.npmjs.com/creating-and-viewing-access-tokens) for the
`@ogunbaysal/mcp-probe` package and add it as a repository secret named `NPM_TOKEN`
(Settings → Secrets and variables → Actions).

To cut a release:

```bash
npm version patch   # or minor / major — bumps package.json and creates a git tag
git push --follow-tags
```

The workflow re-runs lint/typecheck/test, verifies the tag matches `package.json`'s version, then
publishes with `npm publish --provenance --access public`. Package name and version cannot be
reused once published — double-check `package.json` before tagging.

## Pull requests

- Keep PRs focused; unrelated formatting churn makes review harder.
- Update the README if you change documented behavior (flags, exit codes, JSON shape).
- Make sure `npm run lint`, `npm run typecheck`, and `npm test` all pass.
