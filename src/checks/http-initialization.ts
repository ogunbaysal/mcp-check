import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport, SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CheckItem, FatalError, InitializationOutcome } from "../core/result.js";
import { describeError, errnoCode, isRequestTimeout } from "../utils/errors.js";

export interface HttpInitializationOptions {
  clientName: string;
  clientVersion: string;
  timeoutMs: number;
  /** Extra HTTP headers sent with every request, e.g. Authorization for bearer tokens. */
  headers: Record<string, string>;
}

type HttpTransportKind = "streamable-http" | "sse";
// eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional legacy-server fallback, see file doc comment
type HttpTransport = StreamableHTTPClientTransport | SSEClientTransport;

/**
 * Establishes an MCP connection over HTTP. Tries the modern Streamable HTTP
 * transport first; if the server responds in a way that suggests it doesn't
 * support that transport (404/405 on the MCP endpoint), falls back to the
 * deprecated SSE transport, since a meaningful share of still-active MCP
 * servers only implement SSE. Each attempt gets the full `timeoutMs` budget,
 * so a fallback roughly doubles the worst-case wait for an unreachable host
 * — an acceptable tradeoff for correctly identifying legacy servers.
 *
 * Mirrors `checks/initialization.ts`'s stdio counterpart: always returns a
 * `client` (even on failure, for uniform cleanup) and the same
 * `InitializationOutcome` shape, so `core/run-check.ts` can treat both
 * transports identically past this point.
 */
export async function runHttpInitializationCheck(
  url: URL,
  options: HttpInitializationOptions,
): Promise<{ outcome: InitializationOutcome; client: Client }> {
  const requestInit: RequestInit | undefined =
    Object.keys(options.headers).length > 0 ? { headers: options.headers } : undefined;

  const primary = await attemptConnect(
    new StreamableHTTPClientTransport(url, requestInit ? { requestInit } : undefined),
    "streamable-http",
    url,
    options,
  );
  if (primary.outcome.fatal === undefined) {
    return { client: primary.client, outcome: primary.outcome };
  }

  if (shouldFallbackToSse(primary.error)) {
    const fallback = await attemptConnect(
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional legacy-server fallback
      new SSEClientTransport(url, requestInit ? { requestInit } : undefined),
      "sse",
      url,
      options,
    );
    if (fallback.outcome.fatal === undefined) {
      return { client: fallback.client, outcome: fallback.outcome };
    }
  }

  // Report the original Streamable HTTP failure: it's the modern, expected
  // transport, so its error is the more actionable one for the user even
  // when a fallback was also attempted and also failed.
  return { client: primary.client, outcome: primary.outcome };
}

interface AttemptResult {
  client: Client;
  outcome: InitializationOutcome;
  /** The raw thrown error, kept only so the caller can decide on an SSE fallback. */
  error?: unknown;
}

async function attemptConnect(
  transport: HttpTransport,
  kind: HttpTransportKind,
  url: URL,
  options: HttpInitializationOptions,
): Promise<AttemptResult> {
  const client = new Client(
    { name: options.clientName, version: options.clientVersion },
    { capabilities: {} },
  );
  const onErrorLog: string[] = [];
  client.onerror = (error) => {
    onErrorLog.push(describeError(error).message);
  };

  const startedAt = performance.now();
  try {
    // The SDK's own HTTP transport classes declare `sessionId?: string`
    // (without an explicit `| undefined`), which structurally conflicts
    // with our stricter `exactOptionalPropertyTypes` when checked against
    // the generic `Transport` parameter type — a type-declaration looseness
    // in the SDK itself, not a runtime incompatibility.
    await client.connect(transport as Transport, { timeout: options.timeoutMs });
    const initialize = Math.round(performance.now() - startedAt);

    const serverVersion = client.getServerVersion();
    const capabilities = client.getServerCapabilities() ?? {};
    // SSEClientTransport has no public getter for the negotiated protocol
    // version (only StreamableHTTPClientTransport exposes one). Since
    // connect() already throws if the server returned an unsupported
    // version, a successful connect on either transport guarantees a valid
    // version was negotiated even when we can't display the exact string.
    const protocolVersion =
      transport instanceof StreamableHTTPClientTransport ? transport.protocolVersion : undefined;
    const serverName = serverVersion?.name ?? "";

    const checks: CheckItem[] = [
      { id: "init.connection", label: "MCP connection established", status: "pass" },
      protocolVersion === undefined || protocolVersion.length > 0
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
        timings: { initialize },
        server: { name: serverVersion?.name, version: serverVersion?.version },
        protocol: { version: protocolVersion, initialized: true },
        capabilities,
        diagnostics: { pid: null, clientErrors: onErrorLog, stderrTail: "", httpTransport: kind },
      },
    };
  } catch (error) {
    const fatal = classifyFatalError(error, url, options.timeoutMs);
    const checks: CheckItem[] = [
      {
        id: "init.connection",
        label: "MCP connection established",
        status: "fail",
        detail: fatal.message,
      },
    ];
    return {
      client,
      error,
      outcome: {
        fatal,
        checks,
        timings: {},
        diagnostics: { pid: null, clientErrors: onErrorLog, stderrTail: "", httpTransport: kind },
      },
    };
  }
}

/** True when the failure looks like "this endpoint doesn't speak Streamable HTTP", not an auth/server/network error. */
function shouldFallbackToSse(error: unknown): boolean {
  if (error instanceof StreamableHTTPError) {
    return error.code === 404 || error.code === 405;
  }
  return false;
}

function classifyFatalError(error: unknown, url: URL, timeoutMs: number): FatalError {
  const info = describeError(error);

  if (isRequestTimeout(info)) {
    return {
      stage: "initialize",
      kind: "timeout",
      message: `Connection did not complete within ${String(timeoutMs)}ms.`,
      hints: [
        "the server is slow to respond to the initialize request",
        "increase the timeout with --timeout",
      ],
      cause: info.stack ?? info.message,
    };
  }

  if (error instanceof StreamableHTTPError || error instanceof SseError) {
    return classifyHttpStatusError(error.code, info, url);
  }

  const networkCode = fetchCauseCode(error);
  if (networkCode === "ENOTFOUND" || networkCode === "EAI_AGAIN") {
    return {
      stage: "process",
      kind: "process",
      message: `Could not resolve host: ${url.hostname}`,
      hints: ["check the hostname is spelled correctly", "check your network/DNS connection"],
      cause: info.stack ?? info.message,
    };
  }
  if (networkCode === "ECONNREFUSED") {
    return {
      stage: "process",
      kind: "process",
      message: `Connection refused: ${url.href}`,
      hints: [
        "check the server is running and listening on this host/port",
        "check the URL and port are correct",
      ],
      cause: info.stack ?? info.message,
    };
  }
  if (networkCode === "ECONNRESET" || networkCode === "EPIPE") {
    return {
      stage: "process",
      kind: "process",
      message: `Connection was reset: ${url.href}`,
      hints: ["the server closed the connection unexpectedly", "check the server's own logs"],
      cause: info.stack ?? info.message,
    };
  }
  if (networkCode) {
    return {
      stage: "process",
      kind: "process",
      message: `Network error (${networkCode}) connecting to ${url.href}`,
      hints: ["check the URL and network connectivity"],
      cause: info.stack ?? info.message,
    };
  }

  return {
    stage: "initialize",
    kind: "process",
    message: info.message,
    hints: [
      "run again with --verbose for the full error",
      "verify the URL points to a running MCP server",
    ],
    cause: info.stack ?? info.message,
  };
}

function classifyHttpStatusError(
  code: number | undefined,
  info: { message: string; stack?: string | undefined },
  url: URL,
): FatalError {
  if (code === 401 || code === 403) {
    return {
      stage: "initialize",
      kind: "process",
      message: `Server rejected the connection (HTTP ${String(code)}).`,
      hints: [
        'set required credentials with --header "Authorization: Bearer <token>"',
        "verify the token/credentials are valid and not expired",
      ],
      cause: info.stack ?? info.message,
    };
  }
  if (code === 404 || code === 405) {
    return {
      stage: "process",
      kind: "process",
      message: `Endpoint not found (HTTP ${String(code)}) at ${url.href}.`,
      hints: [
        "check the URL path is correct (commonly ends in /mcp)",
        "the server may not implement Streamable HTTP or SSE at this path",
      ],
      cause: info.stack ?? info.message,
    };
  }
  if (code !== undefined && code >= 500) {
    return {
      stage: "initialize",
      kind: "process",
      message: `Server returned an error (HTTP ${String(code)}).`,
      hints: ["the server may be temporarily unavailable", "check the server's own logs"],
      cause: info.stack ?? info.message,
    };
  }
  if (code === -1) {
    return {
      stage: "process",
      kind: "process",
      message: `The response was not a valid MCP endpoint: ${info.message}`,
      hints: [
        "verify the URL points to an MCP server, not a regular web page or API",
        "check the URL includes the correct path",
      ],
      cause: info.stack ?? info.message,
    };
  }
  return {
    stage: "initialize",
    kind: "process",
    message: info.message,
    hints: ["run again with --verbose for the full error"],
    cause: info.stack ?? info.message,
  };
}

/** Unwraps the errno code from the `TypeError: fetch failed` Node's undici fetch throws for network-level failures. */
function fetchCauseCode(error: unknown): string | undefined {
  if (error instanceof TypeError && "cause" in error) {
    return errnoCode(error.cause);
  }
  return undefined;
}
