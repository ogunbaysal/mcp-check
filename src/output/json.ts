import type { CheckResult } from "../core/result.js";

export interface JsonRenderOptions {
  /** Include connection-lifecycle diagnostics (pid, transport errors, stderr tail). */
  verbose: boolean;
}

/**
 * Serializes the shared `CheckResult` model to JSON. Field names match the
 * documented `--json` contract (success, server, protocol, capabilities,
 * warnings, errors, timings) plus additive fields (checks, target, fatal)
 * that give CI consumers more to work with without breaking anyone reading
 * only the documented subset.
 */
export function renderJson(result: CheckResult, options: JsonRenderOptions): string {
  const payload: Record<string, unknown> = {
    success: result.success,
    exitCode: result.exitCode,
    target: result.target,
    server: result.server,
    protocol: result.protocol,
    capabilities: result.capabilities,
    checks: result.checks,
    warnings: result.warnings,
    errors: result.errors,
    timings: result.timings,
  };
  if (result.fatal) {
    // `cause` (raw stack trace / stderr) mirrors the human renderer: only
    // shown under --verbose, everywhere else the stage/message/hints are
    // already the actionable summary.
    const { cause: _cause, ...publicFatal } = result.fatal;
    payload.fatal = options.verbose ? result.fatal : publicFatal;
  }
  if (options.verbose) {
    payload.diagnostics = result.diagnostics;
  }
  return JSON.stringify(payload, null, 2);
}
