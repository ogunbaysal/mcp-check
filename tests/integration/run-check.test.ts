import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { runCheck } from "../../src/core/run-check.js";
import { ExitCode } from "../../src/core/exit-codes.js";

// These tests spawn real fixture MCP servers over real stdio and drive them
// through the actual MCP SDK client, exactly like the CLI does. No mocking
// of the protocol layer.

function fixture(name: string): string {
  return fileURLToPath(new URL(`../../fixtures/${name}/dist/index.js`, import.meta.url));
}

const baseOptions = {
  timeoutMs: 8000,
  strict: false,
  clientVersion: "test",
};

describe("runCheck against real fixture servers", () => {
  it("passes cleanly against a fully-valid server", async () => {
    const result = await runCheck({
      ...baseOptions,
      command: process.execPath,
      args: [fixture("valid-server")],
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.fatal).toBeUndefined();
    expect(result.server).toEqual({ name: "valid-fixture-server", version: "1.2.0" });
    expect(result.capabilities).toEqual({ tools: 2, resources: 2, prompts: 1 });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.checks.every((c) => c.status === "pass")).toBe(true);
    expect(result.timings.initialize).toBeGreaterThanOrEqual(0);
    expect(result.timings.tools).toBeGreaterThanOrEqual(0);
  });

  it("passes against a minimal server and skips unadvertised capabilities", async () => {
    const result = await runCheck({
      ...baseOptions,
      command: process.execPath,
      args: [fixture("minimal-server")],
    });

    expect(result.success).toBe(true);
    expect(result.capabilities).toEqual({});
    expect(result.timings.tools).toBeUndefined();
    expect(result.timings.resources).toBeUndefined();
    expect(result.timings.prompts).toBeUndefined();
    expect(result.checks.some((c) => c.id === "tools.list")).toBe(false);
  });

  it("fails with duplicate-name and missing-description findings against the invalid server", async () => {
    const result = await runCheck({
      ...baseOptions,
      command: process.execPath,
      args: [fixture("invalid-server")],
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(ExitCode.CheckFailure);
    expect(result.errors.some((e) => e.code === "tools.duplicate_name")).toBe(true);
    expect(result.errors.some((e) => e.code === "resources.duplicate_uri")).toBe(true);
    expect(result.warnings.some((w) => w.code === "tools.missing_description")).toBe(true);
  });

  it("reports a fatal process error with the real exit code when the server crashes on startup", async () => {
    const result = await runCheck({
      ...baseOptions,
      command: process.execPath,
      args: [fixture("broken-server")],
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(ExitCode.ProcessError);
    expect(result.fatal).toBeDefined();
    expect(result.fatal?.stage).toBe("initialize");
    expect(result.fatal?.message).toContain("Exit code: 1");
  });

  it("times out and reports exit code 3 against a server that never responds in time", async () => {
    const result = await runCheck({
      ...baseOptions,
      timeoutMs: 300,
      command: process.execPath,
      args: [fixture("slow-server")],
      // The fixture always waits at least this long before connecting its
      // transport, guaranteeing our short timeout fires first.
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(ExitCode.Timeout);
    expect(result.fatal?.kind).toBe("timeout");
  }, 10_000);

  it("surfaces a specific hint when the server writes non-MCP output to stdout", async () => {
    const result = await runCheck({
      ...baseOptions,
      command: process.execPath,
      args: [fixture("noisy-server")],
    });

    expect(result.success).toBe(false);
    expect(result.fatal).toBeDefined();
    expect(result.fatal?.hints.some((h) => h.includes("non-MCP output"))).toBe(true);
  });

  it("reports exit code 4 for a command that does not exist", async () => {
    const result = await runCheck({
      ...baseOptions,
      command: "definitely-not-a-real-mcp-check-binary",
      args: [],
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(ExitCode.ProcessError);
    expect(result.fatal?.stage).toBe("process");
  });

  it("passes by default but fails under --strict when the only finding is a warning", async () => {
    const lenient = await runCheck({
      ...baseOptions,
      strict: false,
      command: process.execPath,
      args: [fixture("warn-only-server")],
    });
    const strict = await runCheck({
      ...baseOptions,
      strict: true,
      command: process.execPath,
      args: [fixture("warn-only-server")],
    });

    expect(lenient.errors).toEqual([]);
    expect(lenient.warnings.some((w) => w.code === "tools.missing_description")).toBe(true);
    expect(lenient.success).toBe(true);
    expect(lenient.exitCode).toBe(ExitCode.Success);

    expect(strict.warnings).toEqual(lenient.warnings);
    expect(strict.success).toBe(false);
    expect(strict.exitCode).toBe(ExitCode.CheckFailure);
  });
});
