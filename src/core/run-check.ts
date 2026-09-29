import { StdioTransport } from "../transport/stdio.js";
import { runInitializationCheck } from "../checks/initialization.js";
import { runToolsCheck } from "../checks/tools.js";
import { runResourcesCheck } from "../checks/resources.js";
import { runPromptsCheck } from "../checks/prompts.js";
import { createEmptyResult, determineExitCode, type CheckResult } from "./result.js";

export interface RunCheckOptions {
  command: string;
  args: string[];
  timeoutMs: number;
  strict: boolean;
  /** Extra environment variables to set on the target process, layered on top of the inherited environment. */
  env: Record<string, string>;
  clientVersion: string;
}

const CLIENT_NAME = "mcp-probe";

/**
 * Runs the full diagnostic suite against a single MCP server: spawns the
 * process, performs the initialize handshake, then (if that succeeds)
 * checks each capability the server actually advertised. Always cleans up
 * the spawned process, including on Ctrl-C.
 */
export async function runCheck(options: RunCheckOptions): Promise<CheckResult> {
  const result = createEmptyResult({ command: options.command, args: options.args });
  const transport = new StdioTransport({
    command: options.command,
    args: options.args,
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
  } finally {
    process.removeListener("SIGINT", killOnSignal);
    process.removeListener("SIGTERM", killOnSignal);
    await transport.close();
  }
}
