import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { runCheck, type RunCheckOptions } from "../../src/core/run-check.js";
import { ExitCode } from "../../src/core/exit-codes.js";

// These tests spawn real fixture MCP servers — over real stdio and, for the
// HTTP suite below, a real local HTTP server — and drive them through the
// actual MCP SDK client, exactly like the CLI does. No mocking of the
// protocol layer.

function fixture(name: string): string {
  return fileURLToPath(new URL(`../../fixtures/${name}/dist/index.js`, import.meta.url));
}

interface StdioCallOptions {
  command: string;
  args?: string[];
  timeoutMs?: number;
  strict?: boolean;
  env?: Record<string, string>;
}

function runStdio(opts: StdioCallOptions) {
  return runCheck({
    target: { type: "stdio", command: opts.command, args: opts.args ?? [] },
    timeoutMs: opts.timeoutMs ?? 8000,
    strict: opts.strict ?? false,
    env: opts.env ?? {},
    clientVersion: "test",
  });
}

interface HttpCallOptions {
  url: string;
  timeoutMs?: number;
  strict?: boolean;
  headers?: Record<string, string>;
}

function runHttp(opts: HttpCallOptions) {
  const options: RunCheckOptions = {
    target: { type: "http", url: opts.url },
    timeoutMs: opts.timeoutMs ?? 8000,
    strict: opts.strict ?? false,
    headers: opts.headers ?? {},
    clientVersion: "test",
  };
  return runCheck(options);
}

describe("runCheck against real stdio fixture servers", () => {
  it("passes cleanly against a fully-valid server", async () => {
    const result = await runStdio({ command: process.execPath, args: [fixture("valid-server")] });

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
    const result = await runStdio({ command: process.execPath, args: [fixture("minimal-server")] });

    expect(result.success).toBe(true);
    expect(result.capabilities).toEqual({});
    expect(result.timings.tools).toBeUndefined();
    expect(result.timings.resources).toBeUndefined();
    expect(result.timings.prompts).toBeUndefined();
    expect(result.checks.some((c) => c.id === "tools.list")).toBe(false);
  });

  it("fails with duplicate-name and missing-description findings against the invalid server", async () => {
    const result = await runStdio({ command: process.execPath, args: [fixture("invalid-server")] });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(ExitCode.CheckFailure);
    expect(result.errors.some((e) => e.code === "tools.duplicate_name")).toBe(true);
    expect(result.errors.some((e) => e.code === "resources.duplicate_uri")).toBe(true);
    expect(result.warnings.some((w) => w.code === "tools.missing_description")).toBe(true);
  });

  it("reports a fatal process error with the real exit code when the server crashes on startup", async () => {
    const result = await runStdio({ command: process.execPath, args: [fixture("broken-server")] });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(ExitCode.ProcessError);
    expect(result.fatal).toBeDefined();
    expect(result.fatal?.stage).toBe("initialize");
    expect(result.fatal?.message).toContain("Exit code: 1");
  });

  it("times out and reports exit code 3 against a server that never responds in time", async () => {
    const result = await runStdio({
      command: process.execPath,
      args: [fixture("slow-server")],
      timeoutMs: 300,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(ExitCode.Timeout);
    expect(result.fatal?.kind).toBe("timeout");
  }, 10_000);

  it("surfaces a specific hint when the server writes non-MCP output to stdout", async () => {
    const result = await runStdio({ command: process.execPath, args: [fixture("noisy-server")] });

    expect(result.success).toBe(false);
    expect(result.fatal).toBeDefined();
    expect(result.fatal?.hints.some((h) => h.includes("non-MCP output"))).toBe(true);
  });

  it("reports exit code 4 for a command that does not exist", async () => {
    const result = await runStdio({ command: "definitely-not-a-real-mcp-check-binary" });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(ExitCode.ProcessError);
    expect(result.fatal?.stage).toBe("process");
  });

  it("passes by default but fails under --strict when the only finding is a warning", async () => {
    const lenient = await runStdio({
      command: process.execPath,
      args: [fixture("warn-only-server")],
      strict: false,
    });
    const strict = await runStdio({
      command: process.execPath,
      args: [fixture("warn-only-server")],
      strict: true,
    });

    expect(lenient.errors).toEqual([]);
    expect(lenient.warnings.some((w) => w.code === "tools.missing_description")).toBe(true);
    expect(lenient.success).toBe(true);
    expect(lenient.exitCode).toBe(ExitCode.Success);

    expect(strict.warnings).toEqual(lenient.warnings);
    expect(strict.success).toBe(false);
    expect(strict.exitCode).toBe(ExitCode.CheckFailure);
  });

  it("passes --env values through to the spawned process's environment", async () => {
    const result = await runStdio({
      command: process.execPath,
      args: [fixture("env-echo-server")],
      env: { MCP_CHECK_TEST_ENV_VALUE: "hello-from-env-flag" },
    });

    expect(result.success).toBe(true);
    expect(result.server?.version).toBe("hello-from-env-flag");
  });

  it("does not require --env: the child still inherits the parent process environment", async () => {
    const result = await runStdio({
      command: process.execPath,
      args: [fixture("env-echo-server")],
    });

    // No MCP_CHECK_TEST_ENV_VALUE was set in this test process's own env,
    // so the fixture falls back to "unset" — proving absence is also
    // faithfully propagated, not silently defaulted by mcp-check itself.
    expect(result.server?.version).toBe("unset");
  });
});

describe("runCheck against a real HTTP fixture server", () => {
  let child: ChildProcess;
  let baseUrl: string;

  beforeAll(async () => {
    const { promise, resolve, reject } = Promise.withResolvers<string>();
    child = spawn(process.execPath, [fixture("http-server")], {
      env: { ...process.env, PORT: "0" },
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.once("error", reject);
    let buffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const match = /LISTENING:(\d+)/.exec(buffer);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    baseUrl = await promise;
  });

  afterAll(() => {
    child.kill();
  });

  it("passes cleanly against a public Streamable HTTP endpoint", async () => {
    const result = await runHttp({ url: `${baseUrl}/mcp` });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.target).toEqual({ type: "http", url: `${baseUrl}/mcp` });
    expect(result.server).toEqual({ name: "http-fixture-server", version: "1.0.0" });
    expect(result.capabilities).toEqual({ tools: 1, resources: 1 });
    expect(result.diagnostics.httpTransport).toBe("streamable-http");
    // No stdio-only concepts leak into an HTTP result.
    expect(result.checks.some((c) => c.id === "process.start")).toBe(false);
    expect(result.timings.processStart).toBeUndefined();
  });

  it("fails with a 401 hint when required auth is missing", async () => {
    const result = await runHttp({ url: `${baseUrl}/mcp-auth`, timeoutMs: 3000 });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(ExitCode.ProcessError);
    expect(result.fatal?.message).toContain("401");
    expect(result.fatal?.hints.some((h) => h.includes("--header"))).toBe(true);
  });

  it("passes when the required auth header is supplied via --header", async () => {
    const result = await runHttp({
      url: `${baseUrl}/mcp-auth`,
      headers: { Authorization: "Bearer test-token-12345" },
    });

    expect(result.success).toBe(true);
    expect(result.server?.name).toBe("http-fixture-server");
  });

  it("falls back to SSE and succeeds against an SSE-only endpoint", async () => {
    const result = await runHttp({ url: `${baseUrl}/sse` });

    expect(result.success).toBe(true);
    expect(result.diagnostics.httpTransport).toBe("sse");
    expect(result.capabilities).toEqual({ tools: 1, resources: 1 });
  });

  it("reports exit code 4 with a clear message for an unreachable port", async () => {
    // Port 1 (and a handful of other low ports) is on undici/fetch's
    // spec-mandated "bad port" blocklist, which produces a different,
    // unclassified error — use a high, definitely-unbound port instead to
    // exercise a genuine ECONNREFUSED.
    const result = await runHttp({ url: "http://127.0.0.1:45999/mcp", timeoutMs: 3000 });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(ExitCode.ProcessError);
    expect(result.fatal?.stage).toBe("process");
  });

  it("reports a not-found hint for a wrong path", async () => {
    const result = await runHttp({ url: `${baseUrl}/does-not-exist`, timeoutMs: 3000 });

    expect(result.success).toBe(false);
    expect(result.fatal?.message).toContain("404");
  });

  it("reports a not-a-valid-MCP-endpoint hint for a non-JSON response", async () => {
    const result = await runHttp({ url: `${baseUrl}/not-json`, timeoutMs: 3000 });

    expect(result.success).toBe(false);
    expect(result.fatal?.hints.some((h) => h.includes("not a regular web page"))).toBe(true);
  });

  it("times out and reports exit code 3 against a server that accepts but never responds", async () => {
    const { promise, resolve } = Promise.withResolvers<undefined>();
    const hungServer = http.createServer(() => {
      /* accept the connection, never respond */
    });
    hungServer.listen(0, "127.0.0.1", () => {
      resolve(undefined);
    });
    await promise;
    const address = hungServer.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const result = await runHttp({ url: `http://127.0.0.1:${String(port)}/mcp`, timeoutMs: 500 });
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(ExitCode.Timeout);
      expect(result.fatal?.kind).toBe("timeout");
    } finally {
      hungServer.close();
    }
  }, 10_000);
});
