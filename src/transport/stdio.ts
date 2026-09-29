import spawn from "cross-spawn";
import type { ChildProcess } from "node:child_process";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import { TimeoutError } from "../utils/timeout.js";
import { errnoCode } from "../utils/errors.js";

/** The exit status of the spawned child process, captured from Node's "exit" event. */
export interface ProcessExitInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface StdioTargetParams {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Milliseconds to wait for the process to emit its "spawn" event. */
  spawnTimeoutMs: number;
}

const MAX_STDERR_BYTES = 16 * 1024;
const KILL_GRACE_MS = 2000;

/**
 * A Node.js stdio transport for the MCP SDK's `Client`/`Protocol` classes.
 *
 * We implement this ourselves (rather than using the SDK's built-in
 * `StdioClientTransport`) because mcp-probe needs full ownership of the
 * child process lifecycle to report accurate diagnostics: the real exit
 * code/signal on premature termination, captured stderr for error hints,
 * a bounded spawn timeout, and a guarantee that the process is always
 * killed on cleanup. The `Transport` interface is the SDK's documented
 * extension point for exactly this kind of customization.
 *
 * Never spawns through a shell: `command`/`args` are passed directly to
 * the OS, so the target command line cannot be reinterpreted by `/bin/sh`.
 */
export class StdioTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private readonly params: StdioTargetParams;
  private child?: ChildProcess | undefined;
  private readonly readBuffer = new ReadBuffer();
  private readonly stderrChunks: Buffer[] = [];
  private stderrBytes = 0;
  private _exitInfo: ProcessExitInfo | null = null;
  private _spawnError: Error | null = null;
  private _spawnDurationMs: number | null = null;
  private _protocolVersion: string | null = null;

  constructor(params: StdioTargetParams) {
    this.params = params;
  }

  get command(): string {
    return this.params.command;
  }

  get pid(): number | null {
    return this.child?.pid ?? null;
  }

  /** Set once the child process has exited, from the "exit" event. */
  get exitInfo(): ProcessExitInfo | null {
    return this._exitInfo;
  }

  /** Set if the OS failed to spawn the process at all (e.g. ENOENT). */
  get spawnError(): Error | null {
    return this._spawnError;
  }

  /** Milliseconds between calling start() and the process reporting "spawn", once known. */
  get spawnDurationMs(): number | null {
    return this._spawnDurationMs;
  }

  get stderrOutput(): string {
    return Buffer.concat(this.stderrChunks).toString("utf8");
  }

  /** True when the underlying spawn error is "command not found". */
  get spawnErrorIsMissingCommand(): boolean {
    return errnoCode(this._spawnError) === "ENOENT";
  }

  /**
   * Called by `Client.connect()` once the initialize response is parsed.
   * This is the only place the negotiated protocol version is available,
   * since the SDK does not expose it via a public getter on `Client`.
   */
  setProtocolVersion(version: string): void {
    this._protocolVersion = version;
  }

  get protocolVersion(): string | null {
    return this._protocolVersion;
  }

  async start(): Promise<void> {
    if (this.child) {
      throw new Error("StdioTransport already started");
    }
    const startedAt = performance.now();
    const { promise, resolve, reject } = Promise.withResolvers<undefined>();
    let settled = false;

    const child = spawn(this.params.command, this.params.args, {
      cwd: this.params.cwd,
      env: { ...process.env, ...this.params.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;

    const spawnTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new TimeoutError("process startup", this.params.spawnTimeoutMs));
      }
    }, this.params.spawnTimeoutMs);

    child.once("error", (error: Error) => {
      this._spawnError = error;
      if (!settled) {
        settled = true;
        clearTimeout(spawnTimer);
        reject(error);
      } else {
        this.onerror?.(error);
      }
    });

    child.once("spawn", () => {
      this._spawnDurationMs = Math.round(performance.now() - startedAt);
      if (!settled) {
        settled = true;
        clearTimeout(spawnTimer);
        resolve(undefined);
      }
    });

    child.on("exit", (code, signal) => {
      this._exitInfo = { code, signal };
    });

    child.on("close", () => {
      this.onclose?.();
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      this.handleStdout(chunk);
    });
    child.stdout?.on("error", (error: Error) => {
      this.onerror?.(error);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      this.captureStderr(chunk);
    });
    // Writing to a dead process's stdin raises EPIPE; treat it as a
    // regular transport error rather than an unhandled exception.
    child.stdin?.on("error", (error: Error) => {
      this.onerror?.(error);
    });

    return promise;
  }

  send(message: JSONRPCMessage): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<undefined>();
    const stdin = this.child?.stdin;
    if (!stdin) {
      reject(new Error("Cannot send: process is not connected"));
      return promise;
    }
    stdin.write(serializeMessage(message), (error) => {
      if (error) reject(error);
      else resolve(undefined);
    });
    return promise;
  }

  async close(): Promise<void> {
    this.readBuffer.clear();
    const child = this.child;
    if (!child) return;

    if (child.exitCode === null && child.signalCode === null) {
      const { promise, resolve } = Promise.withResolvers<undefined>();
      const killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, KILL_GRACE_MS);
      child.once("close", () => {
        clearTimeout(killTimer);
        resolve(undefined);
      });
      child.kill("SIGTERM");
      await promise;
    }
    this.child = undefined;
  }

  private handleStdout(chunk: Buffer): void {
    try {
      this.readBuffer.append(chunk);
      let message = this.readBuffer.readMessage();
      while (message !== null) {
        this.onmessage?.(message);
        message = this.readBuffer.readMessage();
      }
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      void this.close();
    }
  }

  private captureStderr(chunk: Buffer): void {
    this.stderrChunks.push(chunk);
    this.stderrBytes += chunk.length;
    while (this.stderrBytes > MAX_STDERR_BYTES && this.stderrChunks.length > 1) {
      const dropped = this.stderrChunks.shift();
      if (dropped) this.stderrBytes -= dropped.length;
    }
  }
}
