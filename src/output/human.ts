import type { CheckItem, CheckResult, CheckStatus, FatalError } from "../core/result.js";
import { summarizeChecks } from "../core/result.js";
import { STATUS_SYMBOL, colorize, supportsColor } from "./symbols.js";

export interface HumanRenderOptions {
  verbose: boolean;
  quiet: boolean;
  /** Defaults to process.stdout; overridable for tests. */
  stream?: NodeJS.WriteStream;
}

const INIT_CHECK_IDS = new Set([
  "process.start",
  "init.connection",
  "init.protocol",
  "init.server_info",
  "init.capabilities",
]);
const LIST_CHECK_IDS = new Set(["tools.list", "resources.list", "prompts.list"]);

const CAPABILITY_LABELS: readonly (readonly ["tools" | "resources" | "prompts", string])[] = [
  ["tools", "Tools"],
  ["resources", "Resources"],
  ["prompts", "Prompts"],
];

const TIMING_LABELS: readonly (readonly [
  "processStart" | "initialize" | "tools" | "resources" | "prompts",
  string,
])[] = [
  ["processStart", "Process start"],
  ["initialize", "Initialize"],
  ["tools", "List tools"],
  ["resources", "List resources"],
  ["prompts", "List prompts"],
];

export function renderHuman(result: CheckResult, options: HumanRenderOptions): string {
  const color = supportsColor(options.stream ?? process.stdout);

  if (options.quiet) {
    return renderQuiet(result, color);
  }

  const lines: string[] = ["MCP Check", ""];

  if (result.fatal) {
    lines.push(...renderFatal(result, options.verbose, color));
    return lines.join("\n") + "\n";
  }

  for (const check of result.checks.filter((c) => INIT_CHECK_IDS.has(c.id))) {
    lines.push(renderCheckLine(check, color, 0));
  }
  lines.push("");

  if (result.server) {
    lines.push("Server");
    lines.push(
      `  Name: ${result.server.name && result.server.name.length > 0 ? result.server.name : "(unknown)"}`,
    );
    lines.push(
      `  Version: ${result.server.version && result.server.version.length > 0 ? result.server.version : "(unknown)"}`,
    );
    lines.push("");
  }

  const capabilityRows = buildCapabilityRows(result);
  if (capabilityRows.length > 0) {
    lines.push("Capabilities", ...renderTable(capabilityRows, color), "");
  }

  const perfRows = buildPerformanceRows(result);
  if (perfRows.length > 0) {
    lines.push("Performance", ...renderTable(perfRows, color), "");
  }

  const validationChecks = result.checks.filter(
    (c) => !INIT_CHECK_IDS.has(c.id) && !LIST_CHECK_IDS.has(c.id),
  );
  if (validationChecks.length > 0) {
    lines.push("Validation");
    for (const check of validationChecks) lines.push(renderCheckLine(check, color, 2));
    lines.push("");
  }

  if (options.verbose) {
    const verboseLines = renderVerboseDiagnostics(result);
    if (verboseLines.length > 0) lines.push(...verboseLines, "");
  }

  lines.push("Result", "");
  lines.push(...renderSummary(result, color));

  return lines.join("\n") + "\n";
}

interface TableRow {
  symbol?: string;
  status?: CheckStatus;
  label: string;
  value: string;
}

function renderTable(rows: TableRow[], color: boolean): string[] {
  const width = Math.max(...rows.map((r) => r.label.length));
  return rows.map((row) => {
    const label = row.label.padEnd(width + 2, " ");
    const prefix = row.symbol && row.status ? `${colorize(row.symbol, row.status, color)} ` : "";
    return `  ${prefix}${label}${row.value}`;
  });
}

function buildCapabilityRows(result: CheckResult): TableRow[] {
  const rows: TableRow[] = [];
  for (const [key, label] of CAPABILITY_LABELS) {
    const count = result.capabilities[key];
    if (count === undefined) continue;
    const listCheck = result.checks.find((c) => c.id === `${key}.list`);
    const failed = listCheck?.status === "fail";
    rows.push({
      symbol: STATUS_SYMBOL[failed ? "fail" : "pass"],
      status: failed ? "fail" : "pass",
      label,
      value: failed ? "(failed)" : String(count),
    });
  }
  return rows;
}

function buildPerformanceRows(result: CheckResult): TableRow[] {
  const rows: TableRow[] = [];
  for (const [key, label] of TIMING_LABELS) {
    const ms = result.timings[key];
    if (ms === undefined) continue;
    rows.push({ label, value: `${String(ms)}ms` });
  }
  return rows;
}

function renderCheckLine(check: CheckItem, color: boolean, indent: number): string {
  const symbol = colorize(STATUS_SYMBOL[check.status], check.status, color);
  const pad = " ".repeat(indent);
  const suffix = check.status !== "pass" && check.detail ? ` \u2014 ${check.detail}` : "";
  return `${pad}${symbol} ${check.label}${suffix}`;
}

function renderSummary(result: CheckResult, color: boolean): string[] {
  const { passed, warned, failed } = summarizeChecks(result.checks);
  const status = result.success ? "PASS" : "FAIL";
  const lines = [colorize(status, result.success ? "pass" : "fail", color)];
  lines.push(`${plural(passed, "check")} passed`);
  if (failed > 0) lines.push(`${plural(failed, "check")} failed`);
  if (warned > 0) lines.push(plural(warned, "warning"));
  if (!result.success && failed === 0 && result.errors.length === 0 && warned > 0) {
    lines.push("(strict mode: warnings are treated as failures)");
  }
  return lines;
}

function renderQuiet(result: CheckResult, color: boolean): string {
  if (result.fatal) {
    const heading = fatalHeading(result.fatal);
    return `${colorize(STATUS_SYMBOL.fail, "fail", color)} ${heading}\n\n${result.fatal.message}\n`;
  }
  const status = result.success ? "PASS" : "FAIL";
  const lines = [colorize(status, result.success ? "pass" : "fail", color)];
  for (const error of result.errors) {
    lines.push(`${STATUS_SYMBOL.fail} ${error.message}${error.detail ? `: ${error.detail}` : ""}`);
  }
  return lines.join("\n") + "\n";
}

function fatalHeading(fatal: FatalError): string {
  return fatal.stage === "process" ? "Process failed to start" : "MCP connection failed";
}

function renderFatal(result: CheckResult, verbose: boolean, color: boolean): string[] {
  const fatal = result.fatal;
  if (!fatal) return [];
  const lines: string[] = [];
  lines.push(`${colorize(STATUS_SYMBOL.fail, "fail", color)} ${fatalHeading(fatal)}`, "");
  lines.push("Error:", fatal.message, "");

  if (fatal.hints.length > 0) {
    lines.push("Possible causes:");
    for (const hint of fatal.hints) lines.push(`- ${hint}`);
    lines.push("");
  }

  if (verbose) {
    if (fatal.cause) lines.push("Details (--verbose):", fatal.cause, "");
  } else {
    const targetCmd = [result.target.command, ...result.target.args].join(" ");
    lines.push("Run again with:", "", `  mcp-check --verbose ${targetCmd}`, "");
  }

  lines.push("Result", "");
  lines.push(colorize("FAIL", "fail", color));
  return lines;
}

function renderVerboseDiagnostics(result: CheckResult): string[] {
  const lines: string[] = [];
  const { pid, clientErrors, stderrTail } = result.diagnostics;
  const details: string[] = [];
  if (pid !== null) details.push(`  PID: ${String(pid)}`);
  if (result.protocol?.version) details.push(`  Protocol version: ${result.protocol.version}`);
  if (clientErrors.length > 0) {
    details.push(`  Transport errors:`);
    for (const message of clientErrors) details.push(`    - ${message}`);
  }
  if (stderrTail.length > 0) {
    details.push(`  Stderr:`);
    for (const line of stderrTail.split("\n")) details.push(`    ${line}`);
  }
  if (details.length > 0) {
    lines.push("Diagnostics (--verbose)", ...details);
  }
  return lines;
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}
