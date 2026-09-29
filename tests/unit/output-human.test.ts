import { describe, expect, it } from "vitest";
import { renderHuman } from "../../src/output/human.js";
import { createEmptyResult, type CheckResult } from "../../src/core/result.js";
import { ExitCode } from "../../src/core/exit-codes.js";

const NO_TTY = { isTTY: false } as NodeJS.WriteStream;
const TTY = { isTTY: true } as NodeJS.WriteStream;

function buildPassingResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    ...createEmptyResult({ type: "stdio", command: "node", args: ["server.js"] }),
    success: true,
    exitCode: ExitCode.Success,
    server: { name: "demo-server", version: "1.0.0" },
    protocol: { version: "2025-06-18", initialized: true },
    capabilities: { tools: 2 },
    checks: [
      { id: "process.start", label: "Process started", status: "pass" },
      { id: "tools.list", label: "Tools list request succeeds", status: "pass" },
      { id: "tools.names", label: "All tools have names", status: "pass" },
    ],
    timings: { processStart: 3, initialize: 40, tools: 5 },
    ...overrides,
  };
}

describe("renderHuman", () => {
  it("renders a PASS summary with a check count for a clean run", () => {
    const output = renderHuman(buildPassingResult(), {
      verbose: false,
      quiet: false,
      stream: NO_TTY,
    });
    expect(output).toContain("PASS");
    expect(output).toContain("3 checks passed");
  });

  it("shows the server name and version", () => {
    const output = renderHuman(buildPassingResult(), {
      verbose: false,
      quiet: false,
      stream: NO_TTY,
    });
    expect(output).toContain("demo-server");
    expect(output).toContain("1.0.0");
  });

  it("never emits ANSI escape codes on a non-TTY stream", () => {
    const output = renderHuman(buildPassingResult(), {
      verbose: false,
      quiet: false,
      stream: NO_TTY,
    });
    expect(output.includes("\u001b[")).toBe(false);
  });

  it("emits ANSI escape codes on a color-capable TTY", () => {
    const previousNoColor = process.env.NO_COLOR;
    const previousForceColor = process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    try {
      const output = renderHuman(buildPassingResult(), {
        verbose: false,
        quiet: false,
        stream: TTY,
      });
      expect(output.includes("\u001b[")).toBe(true);
    } finally {
      if (previousNoColor !== undefined) process.env.NO_COLOR = previousNoColor;
      if (previousForceColor !== undefined) process.env.FORCE_COLOR = previousForceColor;
    }
  });

  it("reports FAIL with a warning count when a check has status warn", () => {
    const result = buildPassingResult({
      checks: [
        { id: "process.start", label: "Process started", status: "pass" },
        { id: "tools.descriptions", label: "1 tool has no description", status: "warn" },
      ],
      warnings: [{ code: "tools.missing_description", message: "1 tool has no description" }],
    });
    const output = renderHuman(result, { verbose: false, quiet: false, stream: NO_TTY });
    expect(output).toContain("1 warning");
  });

  it("omits the Capabilities section for capabilities the server did not advertise", () => {
    const result = buildPassingResult({ capabilities: {} });
    const output = renderHuman(result, { verbose: false, quiet: false, stream: NO_TTY });
    expect(output).not.toContain("Capabilities");
  });

  it("quiet mode omits section headers and the Server block", () => {
    const output = renderHuman(buildPassingResult(), {
      verbose: false,
      quiet: true,
      stream: NO_TTY,
    });
    expect(output).not.toContain("Server");
    expect(output).not.toContain("Capabilities");
    expect(output.trim().split("\n").length).toBeLessThanOrEqual(2);
  });

  it("renders a fatal error with heading, message, and possible causes", () => {
    const result: CheckResult = {
      ...createEmptyResult({ type: "stdio", command: "node", args: ["server.js"] }),
      fatal: {
        stage: "initialize",
        kind: "process",
        message: "Server process exited before initialization completed.\n\nExit code: 1",
        hints: ["the server crashed during startup"],
      },
      checks: [
        { id: "process.start", label: "Process started", status: "pass" },
        { id: "init.connection", label: "MCP connection established", status: "fail" },
      ],
    };
    const output = renderHuman(result, { verbose: false, quiet: false, stream: NO_TTY });
    expect(output).toContain("MCP connection failed");
    expect(output).toContain("Exit code: 1");
    expect(output).toContain("Possible causes:");
    expect(output).toContain("the server crashed during startup");
    expect(output).toContain("FAIL");
    expect(output).not.toContain("Capabilities");
  });

  it("includes verbose diagnostics only when --verbose is set", () => {
    const result = buildPassingResult({
      diagnostics: { pid: 4242, clientErrors: [], stderrTail: "" },
    });
    const quiet = renderHuman(result, { verbose: false, quiet: false, stream: NO_TTY });
    expect(quiet).not.toContain("4242");

    const verbose = renderHuman(result, { verbose: true, quiet: false, stream: NO_TTY });
    expect(verbose).toContain("4242");
  });
});
