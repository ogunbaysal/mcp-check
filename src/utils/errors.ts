import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/** A safely-extracted description of an unknown thrown value. */
export interface ErrorInfo {
  message: string;
  stack?: string | undefined;
  /** Present when the error originated from the MCP SDK as a JSON-RPC error. */
  mcpErrorCode?: number | undefined;
}

/**
 * Extracts a human-readable message (and stack, when available) from an
 * unknown thrown value without ever throwing itself. MCP servers, transports,
 * and zod validators can all throw non-Error values, so this must handle
 * arbitrary input.
 */
export function describeError(error: unknown): ErrorInfo {
  if (error instanceof McpError) {
    return { message: error.message, stack: error.stack, mcpErrorCode: error.code };
  }
  if (error instanceof Error) {
    const info: ErrorInfo = { message: error.message };
    if (error.stack) info.stack = error.stack;
    return info;
  }
  if (typeof error === "string") {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

/** Returns the `code` field of a Node.js `ErrnoException`, if present. */
export function errnoCode(error: unknown): string | undefined {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

/** True when the error is the MCP SDK's per-request timeout (ErrorCode.RequestTimeout). */
export function isRequestTimeout(info: ErrorInfo): boolean {
  return info.mcpErrorCode === ErrorCode.RequestTimeout;
}
