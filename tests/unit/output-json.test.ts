import { describe, expect, it } from "vitest";
import { renderJson } from "../../src/output/json.js";
import { createEmptyResult, type CheckResult } from "../../src/core/result.js";
import { ExitCode } from "../../src/core/exit-codes.js";

function buildResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    ...createEmptyResult({ command: "node", args: ["server.js"] }),
    success: true,
    exitCode: ExitCode.Success,
    server: { name: "demo-server", version: "1.0.0" },
    protocol: { version: "2025-06-18", initialized: true },
    capabilities: { tools: 2 },
    checks: [{ id: "process.start", label: "Process started", status: "pass" }],
    timings: { processStart: 3, initialize: 40, tools: 5 },
    ...overrides,
  };
}

describe("renderJson", () => {
  it("produces parseable JSON matching the documented top-level fields", () => {
    const output = renderJson(buildResult(), { verbose: false });
    const parsed: unknown = JSON.parse(output);
    expect(parsed).toMatchObject({
      success: true,
      server: { name: "demo-server", version: "1.0.0" },
      protocol: { initialized: true },
      capabilities: { tools: 2 },
      warnings: [],
      errors: [],
      timings: { initialize: 40, tools: 5 },
    });
  });

  it("omits the fatal field when the run was not fatal", () => {
    const parsed = JSON.parse(renderJson(buildResult(), { verbose: false })) as Record<
      string,
      unknown
    >;
    expect("fatal" in parsed).toBe(false);
  });

  it("includes a fatal field when the run aborted early", () => {
    const result = buildResult({
      success: false,
      exitCode: ExitCode.ProcessError,
      fatal: { stage: "process", kind: "process", message: "boom", hints: ["check it"] },
    });
    const parsed = JSON.parse(renderJson(result, { verbose: false })) as { fatal?: unknown };
    expect(parsed.fatal).toEqual({
      stage: "process",
      kind: "process",
      message: "boom",
      hints: ["check it"],
    });
  });

  it("omits diagnostics by default and includes them when verbose", () => {
    const result = buildResult({
      diagnostics: { pid: 1234, clientErrors: ["oops"], stderrTail: "log line" },
    });
    const quiet = JSON.parse(renderJson(result, { verbose: false })) as Record<string, unknown>;
    expect("diagnostics" in quiet).toBe(false);

    const verbose = JSON.parse(renderJson(result, { verbose: true })) as { diagnostics?: unknown };
    expect(verbose.diagnostics).toEqual({
      pid: 1234,
      clientErrors: ["oops"],
      stderrTail: "log line",
    });
  });

  it("omits fatal.cause unless verbose, but always includes stage/message/hints", () => {
    const result = buildResult({
      success: false,
      exitCode: ExitCode.ProcessError,
      fatal: {
        stage: "process",
        kind: "process",
        message: "boom",
        hints: ["check it"],
        cause: "raw stack trace here",
      },
    });
    const quiet = JSON.parse(renderJson(result, { verbose: false })) as {
      fatal?: { cause?: unknown };
    };
    expect(quiet.fatal?.cause).toBeUndefined();

    const verbose = JSON.parse(renderJson(result, { verbose: true })) as {
      fatal?: { cause?: unknown };
    };
    expect(verbose.fatal?.cause).toBe("raw stack trace here");
  });
});
