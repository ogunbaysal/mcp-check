export const USAGE = "Usage: mcp-probe [options] <command> [args...] | <http(s)-url>";

export const HELP_TEXT = `MCP Probe — a health check and linter for MCP servers

${USAGE}

Connects over stdio (spawning a command) or over HTTP (Streamable HTTP,
falling back to SSE for older servers) when the target is a URL.

Examples:
  mcp-probe npx @my-org/my-mcp-server
  mcp-probe node ./dist/server.js
  mcp-probe --json python ./server.py
  mcp-probe --timeout 30000 node server.js
  mcp-probe --env API_KEY=secret --env DEBUG=1 node server.js
  mcp-probe https://api.example.com/mcp
  mcp-probe --header "Authorization: Bearer secret" https://api.example.com/mcp

Options:
  --json              Print a single machine-readable JSON report to stdout.
  --timeout <ms>      Timeout for each stage (process startup, initialize,
                      list operations). Default: 10000.
  --env <KEY=VALUE>   stdio only: set an environment variable on the spawned
                      process. Repeatable, layered on top of the inherited
                      environment; later --env flags win on conflicts.
  --header <Name: Value>
                      http(s) only: set a request header (e.g. for auth).
                      Repeatable; later --header flags win on conflicts.
  --strict            Treat warnings as failures (exit code 1).
  --verbose           Show connection lifecycle and diagnostic details.
  --quiet, -q         Print only the final status and error details.
  --version           Print the mcp-probe version and exit.
  --help, -h          Show this help and exit.

Exit codes:
  0  success
  1  MCP validation/check failure
  2  invalid CLI usage
  3  a stage timed out
  4  the target could not be reached (process failed to start/exited, or
     the HTTP endpoint could not be connected to)

mcp-probe executes the command you pass to it (or connects to the URL you
pass it) with the permissions of the current user. Only run it against
servers you trust.
`;
