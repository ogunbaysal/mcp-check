# MCP Probe

A fast CLI health check and linter for [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers.

```bash
npx @ogunbaysal/mcp-probe npx your-mcp-server
```

It connects to your server — over stdio (spawning a command) or over HTTP (a URL) — runs it
through the MCP handshake, exercises whatever capabilities it advertises
(tools/resources/prompts), validates the results, and prints a report — then exits with a status
code your CI can act on.

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
that starts your server (or the URL it's hosted at), and in well under a second you know whether it
actually works.

It deliberately does **not** try to be an MCP client, an IDE, an agent framework, or an
observability platform. It answers one question — "is my MCP server correctly implemented and
ready to use?" — and stays out of your way otherwise.

## Quick Start

**A local server, run over stdio:**

```bash
npx @ogunbaysal/mcp-probe npx @my-org/my-mcp-server
npx @ogunbaysal/mcp-probe node ./dist/server.js
npx @ogunbaysal/mcp-probe python ./server.py
```

**A remote server, run over HTTP** (the target is auto-detected as a URL when it starts with
`http://` or `https://`; tries the modern Streamable HTTP transport first, falling back to SSE for
older servers):

```bash
npx @ogunbaysal/mcp-probe https://mcp.example.com/mcp
```

Or install it once and reuse it:

```bash
npm install -g @ogunbaysal/mcp-probe
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

# Show connection lifecycle details, captured stderr/network errors, and raw errors
mcp-probe --verbose node server.js

# Only print the final status and any errors
mcp-probe --quiet node server.js

# stdio: set environment variables the server needs (e.g. an API key), repeatable
mcp-probe --env API_KEY=secret --env DEBUG=1 node server.js

# http(s): a remote server behind auth
mcp-probe --header "Authorization: Bearer <token>" https://mcp.example.com/mcp
```

Anything after your server's command belongs to _that_ command, not to mcp-probe — so
`mcp-probe node server.js --port 4000` runs `node server.js --port 4000` and checks it, exactly as
you'd expect. mcp-probe's own flags must come before the target. A URL target takes no further
arguments, since there's no command line to build.

`--env` is stdio-only and `--header` is http(s)-only; mcp-probe rejects the combination that
doesn't match your target as a usage error (exit code 2). The stdio target process always inherits
mcp-probe's own environment, so `export API_KEY=... && mcp-probe ...` already works — `--env` is
the explicit, scriptable alternative, layered on top of (never replacing) the inherited
environment.

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

A real run against a public HTTP endpoint ([DeepWiki's MCP server](https://docs.devin.ai/work-with-devin/deepwiki-mcp)):

```
$ mcp-probe https://mcp.deepwiki.com/mcp

MCP Probe

✓ MCP connection established
✓ Protocol initialized
✓ Server info received
✓ Capabilities received

Server
  Name: DeepWiki
  Version: 2.14.3

Capabilities
  ✓ Tools      3
  ✓ Resources  0
  ✓ Prompts    0

Result

PASS
18 checks passed
```

(Note there's no "Process started" line for an HTTP target — that check only applies to stdio.)

## Checks

mcp-probe only tests capabilities your server actually advertises — it never fails a server for
not implementing tools, resources, or prompts.

**Connection** (stdio: process start + handshake; http(s): Streamable HTTP/SSE handshake)

- stdio: the process starts and doesn't exit before initialization completes
- http(s): the endpoint is reachable and speaks Streamable HTTP or, as a fallback, SSE
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

Every stage above is timed (process start (stdio only), initialize, and each list operation) and
shown in the report as an informational diagnostic. mcp-probe does not fail a server for being slow
in v1 — the architecture leaves room for configurable thresholds later.

## JSON Output

`--json` prints a single JSON document to stdout and nothing else, so it's safe to pipe into
`jq` or parse directly:

```json
{
  "success": true,
  "exitCode": 0,
  "target": { "type": "stdio", "command": "node", "args": ["server.js"] },
  "server": { "name": "example-server", "version": "1.0.0" },
  "protocol": { "version": "2025-06-18", "initialized": true },
  "capabilities": { "tools": 8, "resources": 3, "prompts": 2 },
  "checks": [{ "id": "init.connection", "label": "MCP connection established", "status": "pass" }],
  "warnings": [],
  "errors": [],
  "timings": { "processStart": 3, "initialize": 48, "tools": 32, "resources": 21, "prompts": 19 }
}
```

`target` is `{ "type": "stdio", "command": ..., "args": [...] }` or `{ "type": "http", "url": ... }`
depending on what you ran against. `checks` lists every individual line item with a stable `id` you
can assert on in scripts. `warnings`/`errors` are the same findings collapsed into flat, structured
diagnostics. Add `--verbose` to also include a `diagnostics` object (stdio: pid, stderr tail;
http(s): which transport — `streamable-http` or `sse` — was actually used; both: captured client
errors). When a run fails before a connection could be established, the document includes a
`fatal` field describing the stage, message, and possible causes.

## CI Usage

```yaml
- name: Check MCP server
  run: npx @ogunbaysal/mcp-probe npm run start:mcp
```

```yaml
- name: Check a hosted MCP server (strict, with a longer timeout)
  run: npx @ogunbaysal/mcp-probe --strict --timeout 30000 https://mcp.example.com/mcp
```

## Exit Codes

| Code | Meaning                                                                                                               |
| ---- | --------------------------------------------------------------------------------------------------------------------- |
| `0`  | success                                                                                                               |
| `1`  | MCP validation/check failure                                                                                          |
| `2`  | invalid CLI usage                                                                                                     |
| `3`  | a stage (process startup, initialize, or an operation) timed out                                                      |
| `4`  | the target could not be reached: stdio process failed to start/exited, or the HTTP endpoint could not be connected to |

## Security

mcp-probe executes the command you pass it (or connects to the URL you pass it) with the
permissions of the current user, exactly like running it yourself. It never uses a shell to parse a
stdio command — arguments are passed directly to the OS — but it does not (and cannot) sandbox what
the server itself does once running, nor validate the identity of a remote HTTP endpoint beyond
normal TLS certificate checking. Only run mcp-probe against servers you trust.

## Known limitations

- Connecting to a host that silently drops packets (a "blackholed" route, distinct from a normal
  connection refusal) can leave the process running for the OS's own TCP retry window (commonly
  ~10s) after mcp-probe has already reported the timeout — an underlying Node/undici limitation
  when aborting a connection that never completed its handshake. Ordinary unreachable-host cases
  (wrong port, DNS failure, refused connection) are unaffected and exit promptly.

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
  cli/          argument parsing (incl. stdio-vs-URL target detection), help/version, entrypoint
  core/         the shared result model, exit codes, and run-check.ts (the orchestrator)
  transport/    a purpose-built stdio Transport (full control over spawn/exit-code/cleanup)
  checks/       one module per capability: stdio init, http(s) init, tools, resources, prompts
  validation/   pure functions: given parsed tools/resources/prompts, return findings
  output/       human and JSON renderers, both consuming the same CheckResult
  utils/        timeout, timing, and error-classification helpers

fixtures/       real, runnable MCP servers (stdio and HTTP) used by the integration tests
tests/
  unit/         parser, validation, exit-code, and renderer tests (no process spawning)
  integration/  real client/server communication over real stdio and real HTTP, plus true
                end-to-end CLI tests that spawn the built dist/index.js binary
```

`checks/*` do the I/O (call the MCP client, measure timing) — `checks/initialization.ts` for
stdio, `checks/http-initialization.ts` for HTTP(S) with Streamable HTTP → SSE fallback — both
producing the same shared `InitializationOutcome` shape so `core/run-check.ts` treats either
transport identically past the connection stage. `validation/*` are pure functions that turn
already-fetched data into findings, so they're unit-testable without a live server. Both
`output/human.ts` and `output/json.ts` render the exact same `CheckResult` — neither talks to the
MCP client directly.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
