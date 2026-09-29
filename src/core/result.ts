import { ExitCode } from "./exit-codes.js";

/** Status of a single diagnostic line item shown to the user. */
export type CheckStatus = "pass" | "warn" | "fail";

/**
 * One line item in the report, e.g. "All tools have unique names".
 *
 * `id` is a stable, dotted machine identifier (e.g. "tools.unique_names")
 * used by renderers to group related checks and by tests to assert on
 * specific outcomes without depending on human-readable label text.
 */
export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

/** A structured warning or error, independent of any specific CheckItem. */
export interface Diagnostic {
  /** Stable machine code, e.g. "tools.duplicate_name" or "timeout.initialize". */
  code: string;
  message: string;
  detail?: string;
}

/** The stage of the connection lifecycle in which a fatal error occurred. */
export type FatalStage = "process" | "initialize";

/** The category of a fatal error, used to select the process exit code. */
export type FatalKind = "timeout" | "process";

/**
 * A fatal error aborts the run before capability checks can even begin
 * (the server never reached a usable state). This is distinct from a
 * `CheckItem` with status "fail", which represents a specific check that
 * ran against a live connection and found a problem.
 */
export interface FatalError {
  stage: FatalStage;
  kind: FatalKind;
  message: string;
  hints: string[];
  /** Underlying error message/stack, included for --verbose output. */
  cause?: string;
}

/** Durations, in milliseconds, for each measured stage. Present only for stages that ran. */
export interface Timings {
  processStart?: number | undefined;
  initialize?: number | undefined;
  tools?: number | undefined;
  resources?: number | undefined;
  prompts?: number | undefined;
}

export interface ServerInfo {
  name?: string | undefined;
  version?: string | undefined;
}

export interface ProtocolInfo {
  version?: string | undefined;
  initialized: boolean;
}

/** Advertised capability counts. A key is present only if the server advertised that capability. */
export interface CapabilityCounts {
  tools?: number | undefined;
  resources?: number | undefined;
  prompts?: number | undefined;
}

/**
 * The single source of truth for a check run. Both the human-readable
 * renderer (output/human.ts) and the JSON renderer (output/json.ts) consume
 * exactly this structure; neither renderer talks to the MCP client directly.
 */
export interface CheckResult {
  success: boolean;
  exitCode: ExitCode;
  target: { command: string; args: string[] };
  server?: ServerInfo | undefined;
  protocol?: ProtocolInfo | undefined;
  capabilities: CapabilityCounts;
  checks: CheckItem[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
  timings: Timings;
  /** Set only when the run aborted before capability checks could run. */
  fatal?: FatalError | undefined;
  /**
   * Connection-lifecycle details collected regardless of --verbose; renderers
   * decide whether to display them. Never affects success/exitCode.
   */
  diagnostics: ConnectionDiagnostics;
}

export interface ConnectionDiagnostics {
  pid: number | null;
  /** Messages captured from the MCP client's onerror callback during the run. */
  clientErrors: string[];
  /** Trailing stderr output captured from the child process, if any. */
  stderrTail: string;
}

export function createEmptyResult(target: { command: string; args: string[] }): CheckResult {
  return {
    success: false,
    exitCode: ExitCode.CheckFailure,
    target,
    capabilities: {},
    checks: [],
    warnings: [],
    errors: [],
    timings: {},
    diagnostics: { pid: null, clientErrors: [], stderrTail: "" },
  };
}

export interface ResultSummary {
  passed: number;
  warned: number;
  failed: number;
}

/** Pure helper: tally check outcomes for the final "Result" section. */
export function summarizeChecks(checks: readonly CheckItem[]): ResultSummary {
  let passed = 0;
  let warned = 0;
  let failed = 0;
  for (const check of checks) {
    if (check.status === "pass") passed++;
    else if (check.status === "warn") warned++;
    else failed++;
  }
  return { passed, warned, failed };
}

/**
 * Pure, centralized exit-code decision. A timeout anywhere (fatal or a
 * per-capability operation) takes precedence, since CI consumers often
 * want to distinguish "didn't finish in time" (exit 3, maybe retry with a
 * longer --timeout) from "finished and found real problems" (exit 1).
 */
export function determineExitCode(
  input: Pick<CheckResult, "fatal" | "errors" | "warnings">,
  strict: boolean,
): ExitCode {
  if (input.fatal) {
    return input.fatal.kind === "timeout" ? ExitCode.Timeout : ExitCode.ProcessError;
  }
  if (input.errors.some((error) => error.code.startsWith("timeout."))) {
    return ExitCode.Timeout;
  }
  if (input.errors.length > 0) {
    return ExitCode.CheckFailure;
  }
  if (strict && input.warnings.length > 0) {
    return ExitCode.CheckFailure;
  }
  return ExitCode.Success;
}
