import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioTransport } from "../transport/stdio.js";
import { runInitializationCheck } from "../checks/initialization.js";
import { runHttpInitializationCheck } from "../checks/http-initialization.js";
import { runToolsCheck } from "../checks/tools.js";
import { runResourcesCheck } from "../checks/resources.js";
import { runPromptsCheck } from "../checks/prompts.js";
import {
  createEmptyResult,
  determineExitCode,
  type CheckResult,
  type InitializationOutcome,
} from "./result.js";

// Target shapes are inlined (rather than referencing core/result.ts's
// `Target` via `Extract<Target, ...>`) so TypeScript can see the literal
// "stdio" | "http" discriminant directly and narrow `RunCheckOptions` by
// `options.target.type` — narrowing does not reliably see through an
// `Extract<>` indirection here.
export type RunCheckOptions =
  | {
      target: { type: "stdio"; command: string; args: string[] };
      timeoutMs: number;
      strict: boolean;
      clientVersion: string;
      /** Extra environment variables for the spawned process, layered on top of the inherited environment. */
      env: Record<string, string>;
    }
  | {
      target: { type: "http"; url: string };
      timeoutMs: number;
      strict: boolean;
      clientVersion: string;
      /** Extra HTTP headers sent with every request, e.g. Authorization for bearer tokens. */
      headers: Record<string, string>;
    };

const CLIENT_NAME = "mcp-check";

/** Explicit type predicate: TS does not reliably narrow a union via a nested discriminant like `options.target.type` from a plain comparison. */
function isStdioOptions(
  options: RunCheckOptions,
): options is Extract<RunCheckOptions, { target: { type: "stdio" } }> {
  return options.target.type === "stdio";
}

/**
 * Runs the full diagnostic suite against a single MCP server, over whichever
 * transport `options.target` specifies, then (if the connection succeeded)
 * checks each capability the server actually advertised. Always cleans up
 * the connection, including on Ctrl-C.
 */
export async function runCheck(options: RunCheckOptions): Promise<CheckResult> {
  const result = createEmptyResult(options.target);
  if (isStdioOptions(options)) {
    return runStdioCheck(options, result);
  }
  return runHttpCheck(options, result);
}

async function runStdioCheck(
  options: Extract<RunCheckOptions, { target: { type: "stdio" } }>,
  result: CheckResult,
): Promise<CheckResult> {
  const { target } = options;
  const transport = new StdioTransport({
    command: target.command,
    args: target.args,
    env: options.env,
    spawnTimeoutMs: options.timeoutMs,
  });

  const killOnSignal = (): void => {
    void transport.close();
  };
  process.once("SIGINT", killOnSignal);
  process.once("SIGTERM", killOnSignal);

  try {
    const { client, outcome } = await runInitializationCheck(transport, {
      clientName: CLIENT_NAME,
      clientVersion: options.clientVersion,
      timeoutMs: options.timeoutMs,
    });
    return await mergeOutcomeAndFinish(client, outcome, result, options);
  } finally {
    process.removeListener("SIGINT", killOnSignal);
    process.removeListener("SIGTERM", killOnSignal);
    await transport.close();
  }
}

async function runHttpCheck(
  options: Extract<RunCheckOptions, { target: { type: "http" } }>,
  result: CheckResult,
): Promise<CheckResult> {
  const { target } = options;
  const { client, outcome } = await runHttpInitializationCheck(new URL(target.url), {
    clientName: CLIENT_NAME,
    clientVersion: options.clientVersion,
    timeoutMs: options.timeoutMs,
    headers: options.headers,
  });

  // There's no child process here, so no risk of an orphaned OS process the
  // way stdio has; a signal handler just lets an in-flight connection close
  // promptly instead of waiting out the rest of the timeout budget.
  const onSignal = (): void => {
    void client.close();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    return await mergeOutcomeAndFinish(client, outcome, result, options);
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await client.close().catch(() => {
      // already closed or never connected; nothing to clean up
    });
  }
}

/** Shared tail for both transports: merge the connection outcome, then (if it succeeded) run capability checks. */
async function mergeOutcomeAndFinish(
  client: Client,
  outcome: InitializationOutcome,
  result: CheckResult,
  options: Pick<RunCheckOptions, "timeoutMs" | "strict">,
): Promise<CheckResult> {
  result.checks.push(...outcome.checks);
  result.timings.processStart = outcome.timings.processStart;
  result.timings.initialize = outcome.timings.initialize;
  result.diagnostics = outcome.diagnostics;

  if (outcome.fatal) {
    result.fatal = outcome.fatal;
    result.success = false;
    result.exitCode = determineExitCode(result, options.strict);
    return result;
  }

  result.server = outcome.server;
  result.protocol = outcome.protocol;

  const tools = await runToolsCheck(client, outcome.capabilities, options.timeoutMs);
  const resources = await runResourcesCheck(client, outcome.capabilities, options.timeoutMs);
  const prompts = await runPromptsCheck(client, outcome.capabilities, options.timeoutMs);

  if (tools.attempted) {
    result.capabilities.tools = tools.count;
    result.timings.tools = tools.timingMs;
    result.checks.push(...tools.checks);
    result.warnings.push(...tools.warnings);
    result.errors.push(...tools.errors);
  }
  if (resources.attempted) {
    result.capabilities.resources = resources.count;
    result.timings.resources = resources.timingMs;
    result.checks.push(...resources.checks);
    result.warnings.push(...resources.warnings);
    result.errors.push(...resources.errors);
  }
  if (prompts.attempted) {
    result.capabilities.prompts = prompts.count;
    result.timings.prompts = prompts.timingMs;
    result.checks.push(...prompts.checks);
    result.warnings.push(...prompts.warnings);
    result.errors.push(...prompts.errors);
  }

  result.exitCode = determineExitCode(result, options.strict);
  result.success = result.exitCode === 0;
  return result;
}
