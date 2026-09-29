import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import type { CheckItem, Diagnostic } from "../core/result.js";
import { validatePrompts } from "../validation/prompts.js";
import { describeError, isRequestTimeout } from "../utils/errors.js";

export interface PromptsCheckOutcome {
  /** False when the server did not advertise a prompts capability; nothing was attempted. */
  attempted: boolean;
  count?: number;
  timingMs?: number;
  checks: CheckItem[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

const NOT_ATTEMPTED: PromptsCheckOutcome = {
  attempted: false,
  checks: [],
  warnings: [],
  errors: [],
};

export async function runPromptsCheck(
  client: Client,
  serverCapabilities: ServerCapabilities,
  timeoutMs: number,
): Promise<PromptsCheckOutcome> {
  if (!serverCapabilities.prompts) return NOT_ATTEMPTED;

  const startedAt = performance.now();
  try {
    const result = await client.listPrompts(undefined, { timeout: timeoutMs });
    const timingMs = Math.round(performance.now() - startedAt);
    const validation = validatePrompts(result.prompts);
    return {
      attempted: true,
      count: result.prompts.length,
      timingMs,
      checks: [
        { id: "prompts.list", label: "Prompts list request succeeds", status: "pass" },
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
          id: "prompts.list",
          label: "Prompts list request succeeds",
          status: "fail",
          detail: info.message,
        },
      ],
      warnings: [],
      errors: [
        {
          code: isTimeout ? "timeout.prompts" : "prompts.list_failed",
          message: "Failed to list prompts",
          detail: info.message,
        },
      ],
    };
  }
}
