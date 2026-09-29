import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type {
  CheckItem,
  FatalError,
  InitializationOutcome,
  ConnectionDiagnostics,
} from "../core/result.js";
import type { StdioTransport } from "../transport/stdio.js";
import { TimeoutError } from "../utils/timeout.js";
import { describeError, isRequestTimeout } from "../utils/errors.js";

export interface InitializationOptions {
  clientName: string;
  clientVersion: string;
  timeoutMs: number;
}

/**
 * Establishes the MCP connection: spawns the process, performs the
 * initialize handshake, and sends `notifications/initialized`. Returns
 * either a successful outcome with server/protocol/capability data, or a
 * fatal outcome describing exactly which stage failed and why — nothing
 * downstream (tools/resources/prompts checks) can run without this
 * succeeding first.
 */
export async function runInitializationCheck(
  transport: StdioTransport,
  options: InitializationOptions,
): Promise<{ outcome: InitializationOutcome; client: Client }> {
  const client = new Client(
    { name: options.clientName, version: options.clientVersion },
    { capabilities: {} },
  );
  const onErrorLog: string[] = [];
  client.onerror = (error) => {
    onErrorLog.push(describeError(error).message);
  };

  const connectStartedAt = performance.now();
  try {
    await client.connect(transport, { timeout: options.timeoutMs });
    const totalMs = Math.round(performance.now() - connectStartedAt);
    const processStart = transport.spawnDurationMs ?? 0;
    const initialize = Math.max(totalMs - processStart, 0);

    const serverVersion = client.getServerVersion();
    const capabilities = client.getServerCapabilities() ?? {};
    // The SDK already validates protocolVersion is a supported, non-empty
    // string before connect() resolves; these checks assert that guarantee
    // against the actual returned values rather than merely "it didn't throw".
    const protocolVersion = transport.protocolVersion ?? "";
    const serverName = serverVersion?.name ?? "";

    const checks: CheckItem[] = [
      { id: "process.start", label: "Process started", status: "pass" },
      { id: "init.connection", label: "MCP connection established", status: "pass" },
      protocolVersion.length > 0
        ? { id: "init.protocol", label: "Protocol initialized", status: "pass" }
        : {
            id: "init.protocol",
            label: "Protocol initialized",
            status: "fail",
            detail: "Server did not report a protocol version.",
          },
      serverName.length > 0
        ? { id: "init.server_info", label: "Server info received", status: "pass" }
        : {
            id: "init.server_info",
            label: "Server info received",
            status: "fail",
            detail: "Server did not report a name in serverInfo.",
          },
      { id: "init.capabilities", label: "Capabilities received", status: "pass" },
    ];

    return {
      client,
      outcome: {
        fatal: undefined,
        checks,
        timings: { processStart, initialize },
        server: { name: serverVersion?.name, version: serverVersion?.version },
        protocol: { version: protocolVersion || undefined, initialized: true },
        capabilities,
        diagnostics: {
          pid: transport.pid,
          clientErrors: onErrorLog,
          stderrTail: transport.stderrOutput.trim(),
        },
      },
    };
  } catch (error) {
    const totalMs = Math.round(performance.now() - connectStartedAt);
    const processStart = transport.spawnDurationMs ?? undefined;
    const timings =
      processStart !== undefined
        ? { processStart, initialize: Math.max(totalMs - processStart, 0) }
        : {};
    const fatal = classifyFatalError(error, transport, onErrorLog, options.timeoutMs);
    const checks: CheckItem[] = classifyFailedChecks(fatal);
    const diagnostics: ConnectionDiagnostics = {
      pid: transport.pid,
      clientErrors: onErrorLog,
      stderrTail: transport.stderrOutput.trim(),
    };
    return { client, outcome: { fatal, checks, timings, diagnostics } };
  }
}

function classifyFailedChecks(fatal: FatalError): CheckItem[] {
  if (fatal.stage === "process") {
    return [
      { id: "process.start", label: "Process started", status: "fail", detail: fatal.message },
    ];
  }
  return [
    { id: "process.start", label: "Process started", status: "pass" },
    {
      id: "init.connection",
      label: "MCP connection established",
      status: "fail",
      detail: fatal.message,
    },
  ];
}

function classifyFatalError(
  error: unknown,
  transport: StdioTransport,
  onErrorLog: string[],
  timeoutMs: number,
): FatalError {
  const info = describeError(error);

  if (error instanceof TimeoutError) {
    return {
      stage: "process",
      kind: "timeout",
      message: `The process did not start within ${String(timeoutMs)}ms.`,
      hints: [
        "the command is slow to start, or waiting on stdin",
        "the executable path is wrong",
        "increase the timeout with --timeout",
      ],
      cause: info.stack ?? info.message,
    };
  }

  if (isRequestTimeout(info)) {
    return {
      stage: "initialize",
      kind: "timeout",
      message: `Initialization did not complete within ${String(timeoutMs)}ms.`,
      hints: [
        "the server is waiting on a request it never received",
        "the server is doing slow work (network calls, disk I/O) before responding to initialize",
        "increase the timeout with --timeout",
      ],
      cause: info.stack ?? info.message,
    };
  }

  if (info.mcpErrorCode === ErrorCode.ConnectionClosed) {
    const exitInfo = transport.exitInfo;
    const exitDetail = exitInfo
      ? `Exit code: ${exitInfo.code === null ? "unknown" : String(exitInfo.code)}${
          exitInfo.signal ? ` (signal ${exitInfo.signal})` : ""
        }`
      : "The process closed its connection unexpectedly.";
    const underlying = onErrorLog.at(-1);
    const stderrTail = transport.stderrOutput.trim();
    const hints = underlying
      ? [
          `Underlying error: ${underlying}`,
          "the server is writing non-MCP output to stdout",
          "the server crashed while handling the request",
        ]
      : [
          "the server is writing non-MCP output to stdout",
          "the server crashed during startup",
          "stdio transport is misconfigured",
        ];
    return {
      stage: "initialize",
      kind: "process",
      message: `Server process exited before initialization completed.\n\n${exitDetail}`,
      hints,
      cause: stderrTail.length > 0 ? stderrTail : (info.stack ?? info.message),
    };
  }

  if (transport.spawnError) {
    if (transport.spawnErrorIsMissingCommand) {
      return {
        stage: "process",
        kind: "process",
        message: `Command not found: ${transport.command}`,
        hints: [
          "check that the executable exists and is on PATH",
          "if using npx, verify the package name and that it is published",
          "try running the command directly in your shell first",
        ],
        cause: info.stack ?? info.message,
      };
    }
    return {
      stage: "process",
      kind: "process",
      message: `Failed to start process: ${transport.spawnError.message}`,
      hints: [
        "check file permissions on the executable",
        "verify the command and arguments are correct",
      ],
      cause: info.stack ?? info.message,
    };
  }

  return {
    stage: "initialize",
    kind: "process",
    message: info.message,
    hints: [
      "run again with --verbose for the full error",
      "verify the server implements the MCP stdio protocol correctly",
    ],
    cause: info.stack ?? info.message,
  };
}
