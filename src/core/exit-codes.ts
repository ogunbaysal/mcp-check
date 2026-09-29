/**
 * Centralized process exit codes for mcp-probe.
 *
 * These values are part of the CLI's public contract (documented in the
 * README) and are relied upon by CI pipelines. Never inline a numeric exit
 * code elsewhere in the codebase; import this constant instead.
 */
export const ExitCode = {
  /** All checks passed. */
  Success: 0,
  /** The server connected, but one or more checks failed (or --strict warnings). */
  CheckFailure: 1,
  /** The CLI was invoked incorrectly (bad flags, missing command). */
  InvalidUsage: 2,
  /** A stage (process startup, initialization, or an operation) timed out. */
  Timeout: 3,
  /** The target could not be reached: stdio process failed to start/exited, or the HTTP endpoint could not be connected to. */
  ProcessError: 4,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
