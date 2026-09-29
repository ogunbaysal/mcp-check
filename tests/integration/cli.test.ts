import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { ExitCode } from "../../src/core/exit-codes.js";

// End-to-end: spawns the actual built dist/index.js as a real child process
// (exactly how a user's `npx @ogunbaysal/mcp-probe ...` would run), exercising argument
// parsing, process spawning, and both renderers together. Requires `npm run
// build` to have produced dist/index.js and the fixtures (handled by the
// `pretest` npm script).

const execFileAsync = promisify(execFile);

const cliPath = fileURLToPath(new URL("../../dist/index.js", import.meta.url));

function fixture(name: string): string {
  return fileURLToPath(new URL(`../../fixtures/${name}/dist/index.js`, import.meta.url));
}

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args], {
      timeout: 15_000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.code ?? 1 };
  }
}

describe("mcp-probe CLI (end-to-end)", () => {
  it("prints help and exits 0", async () => {
    const { stdout, exitCode } = await runCli(["--help"]);
    expect(exitCode).toBe(ExitCode.Success);
    expect(stdout).toContain("Usage: mcp-probe");
  });

  it("prints a version string and exits 0", async () => {
    const { stdout, exitCode } = await runCli(["--version"]);
    expect(exitCode).toBe(ExitCode.Success);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exits 2 for invalid usage (no command)", async () => {
    const { exitCode, stderr } = await runCli([]);
    expect(exitCode).toBe(ExitCode.InvalidUsage);
    expect(stderr).toContain("No command specified");
  });

  it("exits 0 and prints a PASS report for a valid server", async () => {
    const { stdout, exitCode } = await runCli(["node", fixture("valid-server")]);
    expect(exitCode).toBe(ExitCode.Success);
    expect(stdout).toContain("MCP Probe");
    expect(stdout).toContain("PASS");
    expect(stdout).toContain("valid-fixture-server");
  });

  it("--json produces a single parseable JSON document on stdout", async () => {
    const { stdout, exitCode } = await runCli(["--json", "node", fixture("valid-server")]);
    expect(exitCode).toBe(ExitCode.Success);
    const parsed = JSON.parse(stdout) as { success: boolean; server?: { name?: string } };
    expect(parsed.success).toBe(true);
    expect(parsed.server?.name).toBe("valid-fixture-server");
  });

  it("exits 1 for a server with real validation failures", async () => {
    const { exitCode, stdout } = await runCli(["node", fixture("invalid-server")]);
    expect(exitCode).toBe(ExitCode.CheckFailure);
    expect(stdout).toContain("FAIL");
  });

  it("exits 4 when the target process cannot be started", async () => {
    const { exitCode } = await runCli(["definitely-not-a-real-mcp-probe-binary"]);
    expect(exitCode).toBe(ExitCode.ProcessError);
  });

  it("exits 3 when a stage times out", async () => {
    const { exitCode, stdout } = await runCli(["--timeout", "300", "node", fixture("slow-server")]);
    expect(exitCode).toBe(ExitCode.Timeout);
    expect(stdout).toContain("did not complete");
  }, 10_000);
});
