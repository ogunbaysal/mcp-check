import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import type { CheckItem, Diagnostic } from "../core/result.js";
import { validateResources } from "../validation/resources.js";
import { describeError, isRequestTimeout } from "../utils/errors.js";

export interface ResourcesCheckOutcome {
  /** False when the server did not advertise a resources capability; nothing was attempted. */
  attempted: boolean;
  count?: number;
  timingMs?: number;
  checks: CheckItem[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

const NOT_ATTEMPTED: ResourcesCheckOutcome = {
  attempted: false,
  checks: [],
  warnings: [],
  errors: [],
};

export async function runResourcesCheck(
  client: Client,
  serverCapabilities: ServerCapabilities,
  timeoutMs: number,
): Promise<ResourcesCheckOutcome> {
  if (!serverCapabilities.resources) return NOT_ATTEMPTED;

  const startedAt = performance.now();
  try {
    const result = await client.listResources(undefined, { timeout: timeoutMs });
    const timingMs = Math.round(performance.now() - startedAt);
    const validation = validateResources(result.resources);
    return {
      attempted: true,
      count: result.resources.length,
      timingMs,
      checks: [
        { id: "resources.list", label: "Resources list request succeeds", status: "pass" },
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
          id: "resources.list",
          label: "Resources list request succeeds",
          status: "fail",
          detail: info.message,
        },
      ],
      warnings: [],
      errors: [
        {
          code: isTimeout ? "timeout.resources" : "resources.list_failed",
          message: "Failed to list resources",
          detail: info.message,
        },
      ],
    };
  }
}
