export const USAGE = "Usage: mcp-probe [options] <command> [args...]";

export const HELP_TEXT = `MCP Probe — a health check and linter for MCP servers

${USAGE}

Examples:
  mcp-probe npx @my-org/my-mcp-server
  mcp-probe node ./dist/server.js
  mcp-probe --json python ./server.py
  mcp-probe --timeout 30000 node server.js
  mcp-probe --env API_KEY=secret --env DEBUG=1 node server.js

Options:
  --json              Print a single machine-readable JSON report to stdout.
  --timeout <ms>      Timeout for each stage (process startup, initialize,
                      list operations). Default: 10000.
  --env <KEY=VALUE>   Set an environment variable on the target process.
                      Repeatable. Layered on top of the inherited
                      environment; later --env flags win on conflicts.
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
  4  child process/server execution failure

mcp-probe executes the command you pass to it with the permissions of the
current user. Only run it against servers you trust.
`;
