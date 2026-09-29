import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import type { CheckItem, Diagnostic } from "../core/result.js";
import { validateTools } from "../validation/tools.js";
import { describeError, isRequestTimeout } from "../utils/errors.js";

export interface ToolsCheckOutcome {
  /** False when the server did not advertise a tools capability; nothing was attempted. */
  attempted: boolean;
  count?: number;
  timingMs?: number;
  checks: CheckItem[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

const NOT_ATTEMPTED: ToolsCheckOutcome = { attempted: false, checks: [], warnings: [], errors: [] };

export async function runToolsCheck(
  client: Client,
  serverCapabilities: ServerCapabilities,
  timeoutMs: number,
): Promise<ToolsCheckOutcome> {
  if (!serverCapabilities.tools) return NOT_ATTEMPTED;

  const startedAt = performance.now();
  try {
    const result = await client.listTools(undefined, { timeout: timeoutMs });
    const timingMs = Math.round(performance.now() - startedAt);
    const validation = validateTools(result.tools);
    return {
      attempted: true,
      count: result.tools.length,
      timingMs,
      checks: [
        { id: "tools.list", label: "Tools list request succeeds", status: "pass" },
        ...validation.checks,
      ],
      warnings: validation.warnings,
      errors: validation.errors,
    };
  } catch (error) {
    const timingMs = Math.round(performance.now() - startedAt);
    const info = describeError(error);
    const isTimeout = isRequestTimeout(info);
    return {
      attempted: true,
      timingMs,
      checks: [
        {
          id: "tools.list",
          label: "Tools list request succeeds",
          status: "fail",
          detail: info.message,
        },
      ],
      warnings: [],
      errors: [
        {
          code: isTimeout ? "timeout.tools" : "tools.list_failed",
          message: "Failed to list tools",
          detail: info.message,
        },
      ],
    };
  }
}
