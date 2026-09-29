import { describe, expect, it, vi } from "vitest";
import { withTimeout, TimeoutError } from "../../src/utils/timeout.js";
import { describeError, errnoCode, isRequestTimeout } from "../../src/utils/errors.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

describe("withTimeout", () => {
  it("resolves with the underlying value when it finishes in time", async () => {
    const value = await withTimeout(Promise.resolve("done"), 100, "test stage");
    expect(value).toBe("done");
  });

  it("rejects with a TimeoutError carrying the stage and duration once the timer fires", async () => {
    vi.useFakeTimers();
    try {
      const pending = withTimeout(new Promise<never>(() => undefined), 10, "connecting");
      const assertion = expect(pending).rejects.toThrow(TimeoutError);
      await vi.advanceTimersByTimeAsync(10);
      await assertion;

      let caught: unknown;
      const pending2 = withTimeout(new Promise<never>(() => undefined), 10, "connecting");
      const capture = pending2.catch((error: unknown) => {
        caught = error;
      });
      await vi.advanceTimersByTimeAsync(10);
      await capture;
      expect(caught).toBeInstanceOf(TimeoutError);
      if (caught instanceof TimeoutError) {
        expect(caught.stage).toBe("connecting");
        expect(caught.ms).toBe(10);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates the original rejection when the promise rejects before the timer", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000, "x")).rejects.toThrow("boom");
  });
});

describe("describeError", () => {
  it("extracts message and stack from a plain Error", () => {
    const info = describeError(new Error("plain failure"));
    expect(info.message).toBe("plain failure");
    expect(info.stack).toBeDefined();
    expect(info.mcpErrorCode).toBeUndefined();
  });

  it("extracts the JSON-RPC error code from an McpError", () => {
    const info = describeError(new McpError(ErrorCode.RequestTimeout, "Request timed out"));
    expect(info.mcpErrorCode).toBe(ErrorCode.RequestTimeout);
    expect(info.message).toContain("Request timed out");
  });

  it("handles a plain string being thrown", () => {
    expect(describeError("just a string").message).toBe("just a string");
  });

  it("never throws for arbitrary non-Error values", () => {
    expect(() => describeError(undefined)).not.toThrow();
    expect(() => describeError({ weird: true })).not.toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeError(circular)).not.toThrow();
  });
});

describe("errnoCode", () => {
  it("extracts a string code property from an error", () => {
    const err = Object.assign(new Error("enoent"), { code: "ENOENT" });
    expect(errnoCode(err)).toBe("ENOENT");
  });

  it("returns undefined when there is no code", () => {
    expect(errnoCode(new Error("plain"))).toBeUndefined();
    expect(errnoCode("not an error")).toBeUndefined();
  });
});

describe("isRequestTimeout", () => {
  it("is true only for the SDK's RequestTimeout error code", () => {
    expect(isRequestTimeout(describeError(new McpError(ErrorCode.RequestTimeout, "timeout")))).toBe(
      true,
    );
    expect(
      isRequestTimeout(describeError(new McpError(ErrorCode.ConnectionClosed, "closed"))),
    ).toBe(false);
    expect(isRequestTimeout(describeError(new Error("plain")))).toBe(false);
  });
});
