import { describe, expect, it } from "vitest";
import {
  determineExitCode,
  summarizeChecks,
  type CheckItem,
  type Diagnostic,
  type FatalError,
} from "../../src/core/result.js";
import { ExitCode } from "../../src/core/exit-codes.js";

const noErrors: Diagnostic[] = [];
const noWarnings: Diagnostic[] = [];

describe("determineExitCode", () => {
  it("returns Success when there are no errors or warnings", () => {
    expect(
      determineExitCode({ fatal: undefined, errors: noErrors, warnings: noWarnings }, false),
    ).toBe(ExitCode.Success);
  });

  it("returns CheckFailure when there are errors", () => {
    const errors: Diagnostic[] = [{ code: "tools.duplicate_name", message: "dup" }];
    expect(determineExitCode({ fatal: undefined, errors, warnings: noWarnings }, false)).toBe(
      ExitCode.CheckFailure,
    );
  });

  it("returns Success with warnings when not strict", () => {
    const warnings: Diagnostic[] = [{ code: "tools.missing_description", message: "warn" }];
    expect(determineExitCode({ fatal: undefined, errors: noErrors, warnings }, false)).toBe(
      ExitCode.Success,
    );
  });

  it("returns CheckFailure with warnings when strict", () => {
    const warnings: Diagnostic[] = [{ code: "tools.missing_description", message: "warn" }];
    expect(determineExitCode({ fatal: undefined, errors: noErrors, warnings }, true)).toBe(
      ExitCode.CheckFailure,
    );
  });

  it("returns Timeout for a fatal timeout, regardless of strict", () => {
    const fatal: FatalError = {
      stage: "initialize",
      kind: "timeout",
      message: "timed out",
      hints: [],
    };
    expect(determineExitCode({ fatal, errors: noErrors, warnings: noWarnings }, false)).toBe(
      ExitCode.Timeout,
    );
  });

  it("returns ProcessError for a fatal process error", () => {
    const fatal: FatalError = {
      stage: "process",
      kind: "process",
      message: "spawn failed",
      hints: [],
    };
    expect(determineExitCode({ fatal, errors: noErrors, warnings: noWarnings }, false)).toBe(
      ExitCode.ProcessError,
    );
  });

  it("returns Timeout when a non-fatal operation error is itself a timeout", () => {
    const errors: Diagnostic[] = [{ code: "timeout.tools", message: "tools list timed out" }];
    expect(determineExitCode({ fatal: undefined, errors, warnings: noWarnings }, false)).toBe(
      ExitCode.Timeout,
    );
  });
});

describe("summarizeChecks", () => {
  it("tallies pass/warn/fail counts", () => {
    const checks: CheckItem[] = [
      { id: "a", label: "a", status: "pass" },
      { id: "b", label: "b", status: "pass" },
      { id: "c", label: "c", status: "warn" },
      { id: "d", label: "d", status: "fail" },
    ];
    expect(summarizeChecks(checks)).toEqual({ passed: 2, warned: 1, failed: 1 });
  });

  it("returns zeros for an empty check list", () => {
    expect(summarizeChecks([])).toEqual({ passed: 0, warned: 0, failed: 0 });
  });
});
