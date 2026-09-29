import type { CheckStatus } from "../core/result.js";

/**
 * Status is always communicated via these ASCII/Unicode symbols, never via
 * color alone, so output stays meaningful when piped, in CI logs, or for
 * users without color support.
 */
export const STATUS_SYMBOL: Record<CheckStatus, string> = {
  pass: "\u2713", // ✓
  warn: "!",
  fail: "\u2717", // ✗
};

const ANSI_CODE: Record<CheckStatus, string> = {
  pass: "32", // green
  warn: "33", // yellow
  fail: "31", // red
};

/**
 * True when the terminal is a color-capable TTY and the user hasn't opted
 * out. Respects the NO_COLOR convention (https://no-color.org) and
 * FORCE_COLOR for explicit override, and never colors non-TTY output (pipes,
 * CI log files) by default.
 */
export function supportsColor(stream: NodeJS.WriteStream | undefined): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return process.env.FORCE_COLOR !== "0";
  return Boolean(stream?.isTTY);
}

/** Wraps `text` in an ANSI color code for `status` when `enabled`; otherwise returns `text` unchanged. */
export function colorize(text: string, status: CheckStatus, enabled: boolean): string {
  if (!enabled) return text;
  return `\u001b[${ANSI_CODE[status]}m${text}\u001b[0m`;
}
