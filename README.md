# MCP Probe

A fast CLI health check and linter for [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers.

```bash
npx mcp-probe npx your-mcp-server
```

It connects to your server over stdio, runs it through the MCP handshake, exercises whatever
capabilities it advertises (tools/resources/prompts), validates the results, and prints a report —
then exits with a status code your CI can act on.

```
$ mcp-probe node ./dist/server.js

MCP Probe

✓ Process started
✓ MCP connection established
✓ Protocol initialized
✓ Server info received
✓ Capabilities received

Server
  Name: github-mcp
  Version: 1.2.0

Capabilities
  ✓ Tools      8
  ✓ Resources  3
  ✓ Prompts    2

Performance
  Process start   3ms
  Initialize      48ms
  List tools      32ms
  List resources  21ms
  List prompts    19ms

Validation
  ✓ All tools have names
  ✓ Tool names are unique
  ✓ Input schemas are structurally valid
  ! 2 tool(s) have no description

Result

PASS
17 checks passed
1 warning
```

## Why?

MCP servers are easy to get subtly wrong: a duplicate tool name, a missing description, a server
that writes a stray `console.log` to stdout and silently breaks the JSON-RPC stream. Most of these
bugs only surface once a real client (an IDE, an agent) tries to use the server — and even then the
error is usually an opaque connection failure with no explanation.

mcp-probe is the `curl` + healthcheck + linter you run before that happens: point it at the command
that starts your server, and in well under a second you know whether it actually works.

It deliberately does **not** try to be an MCP client, an IDE, an agent framework, or an
observability platform. It answers one question — "is my MCP server correctly implemented and
ready to use?" — and stays out of your way otherwise.

## Quick Start

```bash
npx mcp-probe npx @my-org/my-mcp-server
```

```bash
npx mcp-probe node ./dist/server.js
```

```bash
npx mcp-probe python ./server.py
```

Or install it once and reuse it:

```bash
npm install -g mcp-probe
mcp-probe node ./dist/server.js
```

## Examples

```bash
# Human-readable report (default)
mcp-probe node server.js

# Machine-readable JSON for scripts/CI
mcp-probe --json node server.js

# Give a slow server more time (default is 10000ms)
mcp-probe --timeout 30000 node server.js

# Treat warnings (e.g. missing tool descriptions) as failures
mcp-probe --strict node server.js

# Show connection lifecycle details, captured stderr, and raw errors
mcp-probe --verbose node server.js

# Only print the final status and any errors
mcp-probe --quiet node server.js

# Set environment variables the server needs (e.g. an API key), repeatable
mcp-probe --env API_KEY=secret --env DEBUG=1 node server.js
```

Anything after your server's command belongs to _that_ command, not to mcp-probe — so
`mcp-probe node server.js --port 4000` runs `node server.js --port 4000` and checks it, exactly as
you'd expect. mcp-probe's own flags must come before the command.

The target process always inherits mcp-probe's own environment, so `export API_KEY=... && mcp-probe
...` already works. `--env KEY=VALUE` is the explicit, scriptable alternative — handy in CI or when
you don't want to export a variable into the whole shell — and is layered on top of (never
replaces) the inherited environment.

A failing server looks like this:

```
$ mcp-probe node ./broken-server.js

MCP Probe

✗ MCP connection failed

Error:
Server process exited before initialization completed.

Exit code: 1

Possible causes:
- the server is writing non-MCP output to stdout
- the server crashed during startup
- stdio transport is misconfigured

Run again with:

  mcp-probe --verbose node ./broken-server.js

Result

FAIL
```

## Checks

mcp-probe only tests capabilities your server actually advertises — it never fails a server for
not implementing tools, resources, or prompts.

**Process & connection**

- the process starts and the stdio transport connects
- the process doesn't exit before initialization completes
- the initialize handshake succeeds and returns a protocol version, server info, and capabilities

**Tools** (if the server advertises `tools`)

- `tools/list` succeeds and the response is structurally valid
- every tool has a non-empty, unique name
- every tool's `inputSchema` is a plausible JSON Schema object
- missing descriptions are reported as a **warning**, not a failure

**Resources** (if the server advertises `resources`)

- `resources/list` succeeds
- every resource has a URI and a name
- URIs are unique and well-formed

**Prompts** (if the server advertises `prompts`)

- `prompts/list` succeeds
- every prompt has a unique, non-empty name
- prompt arguments are structurally valid

**Performance**

Every stage above is timed (process start, initialize, and each list operation) and shown in the
report as an informational diagnostic. mcp-probe does not fail a server for being slow in v1 — the
architecture leaves room for configurable thresholds later.

## JSON Output

`--json` prints a single JSON document to stdout and nothing else, so it's safe to pipe into
`jq` or parse directly:

```json
{
  "success": true,
  "exitCode": 0,
  "target": { "command": "node", "args": ["server.js"] },
  "server": { "name": "example-server", "version": "1.0.0" },
  "protocol": { "version": "2025-06-18", "initialized": true },
  "capabilities": { "tools": 8, "resources": 3, "prompts": 2 },
  "checks": [{ "id": "process.start", "label": "Process started", "status": "pass" }],
  "warnings": [],
  "errors": [],
  "timings": { "processStart": 3, "initialize": 48, "tools": 32, "resources": 21, "prompts": 19 }
}
```

`checks` lists every individual line item with a stable `id` you can assert on in scripts.
`warnings`/`errors` are the same findings collapsed into flat, structured diagnostics. Add
`--verbose` to also include a `diagnostics` object (pid, captured transport errors, stderr tail).
When a run fails before a connection could be established, the document includes a `fatal` field
describing the stage, message, and possible causes.

## CI Usage

```yaml
- name: Check MCP server
  run: npx mcp-probe npm run start:mcp
```

```yaml
- name: Check MCP server (strict, with a longer timeout)
  run: npx mcp-probe --strict --timeout 30000 node ./dist/server.js
```

## Exit Codes

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| `0`  | success                                                          |
| `1`  | MCP validation/check failure                                     |
| `2`  | invalid CLI usage                                                |
| `3`  | a stage (process startup, initialize, or an operation) timed out |
| `4`  | the child process could not be started or exited unexpectedly    |

## Security

mcp-probe executes the command you pass to it with the permissions of the current user, exactly
like running it yourself. It never uses a shell to parse the command — arguments are passed
directly to the OS — but it does not (and cannot) sandbox what the server itself does once running.
Only run mcp-probe against servers you trust.

## Development

```bash
git clone https://github.com/ogunbaysal/mcp-check.git
cd mcp-check
npm install
npm test
```

```bash
npm run build       # bundle the CLI (dist/) and fixture servers (fixtures/*/dist)
npm run dev          # rebuild on change and run --help
npm test             # build fixtures, then run the full unit + integration suite
npm run test:watch   # vitest watch mode
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm run format        # prettier --write
```

The project is a small set of pure modules wired together by one orchestrator:

```
src/
  cli/          argument parsing, help/version, the process entrypoint
  core/         the shared result model, exit codes, and run-check.ts (the orchestrator)
  transport/    a purpose-built stdio Transport (full control over spawn/exit-code/cleanup)
  checks/       one module per capability: initialization, tools, resources, prompts
  validation/   pure functions: given parsed tools/resources/prompts, return findings
  output/       human and JSON renderers, both consuming the same CheckResult
  utils/        timeout, timing, and error-classification helpers

fixtures/       real, runnable MCP servers used by the integration tests
tests/
  unit/         parser, validation, exit-code, and renderer tests (no process spawning)
  integration/  real client/server communication over real stdio, plus true end-to-end
                CLI tests that spawn the built dist/index.js binary
```

`checks/*` do the I/O (call the MCP client, measure timing); `validation/*` are pure functions
that turn already-fetched data into findings, so they're unit-testable without a live server.
Both `output/human.ts` and `output/json.ts` render the exact same `CheckResult` — neither talks to
the MCP client directly.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
