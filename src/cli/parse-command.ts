export type ParsedTarget =
  { type: "stdio"; command: string; args: string[] } | { type: "http"; url: string };

export interface ParsedArgs {
  help: boolean;
  version: boolean;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  strict: boolean;
  timeoutMs: number;
  /** stdio only: extra environment variables for the spawned process. */
  env: Record<string, string>;
  /** http only: extra HTTP headers (e.g. Authorization) for the connection. */
  headers: Record<string, string>;
  /** null only when help/version is set and no target was given. */
  target: ParsedTarget | null;
}

export type ParseResult = { ok: true; value: ParsedArgs } | { ok: false; error: string };

export const DEFAULT_TIMEOUT_MS = 10_000;

/** A target token is treated as a remote HTTP(S) MCP endpoint rather than a command to spawn. */
function isHttpUrl(token: string): boolean {
  return token.startsWith("http://") || token.startsWith("https://");
}

/**
 * Parses `mcp-check [options] <command> [command args...]` or
 * `mcp-check [options] <http(s)-url>`.
 *
 * Only tokens up to (and not including) the first non-flag token are
 * treated as mcp-check's own options. Everything from that point on
 * — including anything that looks like one of our flags — belongs to the
 * target command and is passed through verbatim. This mirrors tools like
 * `env`/`time`: `mcp-check node server.js --json` runs `node` with a
 * `--json` argument of its own, it does not switch mcp-check into JSON mode.
 * A URL target takes no further arguments (there is no command line to
 * build), so anything after it is a usage error.
 */
export function parseCliArgs(argv: readonly string[]): ParseResult {
  const args: ParsedArgs = {
    help: false,
    version: false,
    json: false,
    quiet: false,
    verbose: false,
    strict: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    env: {},
    headers: {},
    target: null,
  };

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === undefined) break;

    if (token === "--") {
      i++;
      break;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      i++;
      continue;
    }
    if (token === "--version") {
      args.version = true;
      i++;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      i++;
      continue;
    }
    if (token === "--quiet" || token === "-q") {
      args.quiet = true;
      i++;
      continue;
    }
    if (token === "--verbose") {
      args.verbose = true;
      i++;
      continue;
    }
    if (token === "--strict") {
      args.strict = true;
      i++;
      continue;
    }
    if (token === "--env" || token.startsWith("--env=")) {
      const raw = token.startsWith("--env=") ? token.slice("--env=".length) : argv[i + 1];
      if (raw === undefined) {
        return { ok: false, error: "--env requires a value in KEY=VALUE format." };
      }
      const eq = raw.indexOf("=");
      if (eq <= 0) {
        return { ok: false, error: `--env must be in KEY=VALUE format, got "${raw}".` };
      }
      args.env[raw.slice(0, eq)] = raw.slice(eq + 1);
      i += token.startsWith("--env=") ? 1 : 2;
      continue;
    }
    if (token === "--header" || token.startsWith("--header=")) {
      const raw = token.startsWith("--header=") ? token.slice("--header=".length) : argv[i + 1];
      if (raw === undefined) {
        return { ok: false, error: '--header requires a value in "Name: Value" format.' };
      }
      const colon = raw.indexOf(":");
      if (colon <= 0) {
        return { ok: false, error: `--header must be in "Name: Value" format, got "${raw}".` };
      }
      args.headers[raw.slice(0, colon).trim()] = raw.slice(colon + 1).trim();
      i += token.startsWith("--header=") ? 1 : 2;
      continue;
    }
    if (token === "--timeout" || token.startsWith("--timeout=")) {
      const raw = token.startsWith("--timeout=") ? token.slice("--timeout=".length) : argv[i + 1];
      if (raw === undefined) {
        return { ok: false, error: "--timeout requires a value in milliseconds." };
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {
          ok: false,
          error: `--timeout must be a positive number of milliseconds, got "${raw}".`,
        };
      }
      args.timeoutMs = parsed;
      i += token.startsWith("--timeout=") ? 1 : 2;
      continue;
    }
    if (token.startsWith("-") && token !== "-") {
      return { ok: false, error: `Unknown option: ${token}` };
    }
    // First non-flag token: everything from here on is the target.
    break;
  }

  const rest = argv.slice(i);
  const first = rest[0];
  if (first !== undefined) {
    if (isHttpUrl(first)) {
      if (rest.length > 1) {
        return {
          ok: false,
          error: `Unexpected argument(s) after URL: ${rest.slice(1).join(" ")}`,
        };
      }
      args.target = { type: "http", url: first };
    } else {
      args.target = { type: "stdio", command: first, args: rest.slice(1) };
    }
  }

  if (!args.help && !args.version && args.target === null) {
    return {
      ok: false,
      error: "No command specified. Usage: mcp-check [options] <command> [args...]",
    };
  }

  if (args.target?.type === "stdio" && Object.keys(args.headers).length > 0) {
    return { ok: false, error: "--header is only valid with an http(s) URL target." };
  }
  if (args.target?.type === "http" && Object.keys(args.env).length > 0) {
    return { ok: false, error: "--env is only valid with a stdio command target." };
  }

  return { ok: true, value: args };
}
