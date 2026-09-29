export interface ParsedArgs {
  help: boolean;
  version: boolean;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  strict: boolean;
  timeoutMs: number;
  /** null only when help/version is set and no command was given. */
  command: string | null;
  commandArgs: string[];
}

export type ParseResult = { ok: true; value: ParsedArgs } | { ok: false; error: string };

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Parses `mcp-check [options] <command> [command args...]`.
 *
 * Only tokens up to (and not including) the first non-flag token are
 * treated as mcp-check's own options. Everything from that point on
 * — including anything that looks like one of our flags — belongs to the
 * target command and is passed through verbatim. This mirrors tools like
 * `env`/`time`: `mcp-check node server.js --json` runs `node` with a
 * `--json` argument of its own, it does not switch mcp-check into JSON mode.
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
    command: null,
    commandArgs: [],
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
    // First non-flag token: everything from here on is the target command.
    break;
  }

  const rest = argv.slice(i);
  if (rest.length > 0) {
    args.command = rest[0] ?? null;
    args.commandArgs = rest.slice(1);
  }

  if (!args.help && !args.version && args.command === null) {
    return {
      ok: false,
      error: "No command specified. Usage: mcp-check [options] <command> [args...]",
    };
  }

  return { ok: true, value: args };
}
