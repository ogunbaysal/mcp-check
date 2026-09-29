import { describe, expect, it } from "vitest";
import { validateTools } from "../../src/validation/tools.js";

const okSchema = { type: "object", properties: {} };

describe("validateTools", () => {
  it("passes every check for a well-formed tool list", () => {
    const outcome = validateTools([
      { name: "a", description: "does a", inputSchema: okSchema },
      { name: "b", description: "does b", inputSchema: okSchema },
    ]);
    expect(outcome.errors).toEqual([]);
    expect(outcome.warnings).toEqual([]);
    expect(outcome.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("flags duplicate tool names as an error, not just a warning", () => {
    const outcome = validateTools([
      { name: "dup", description: "first", inputSchema: okSchema },
      { name: "dup", description: "second", inputSchema: okSchema },
    ]);
    expect(outcome.errors.some((e) => e.code === "tools.duplicate_name")).toBe(true);
    const check = outcome.checks.find((c) => c.id === "tools.unique_names");
    expect(check?.status).toBe("fail");
  });

  it("flags an empty tool name as an error", () => {
    const outcome = validateTools([{ name: "  ", description: "x", inputSchema: okSchema }]);
    expect(outcome.errors.some((e) => e.code === "tools.empty_name")).toBe(true);
  });

  it("treats a missing description as a warning, not an error", () => {
    const outcome = validateTools([{ name: "a", inputSchema: okSchema }]);
    expect(outcome.errors).toEqual([]);
    expect(outcome.warnings.some((w) => w.code === "tools.missing_description")).toBe(true);
    const check = outcome.checks.find((c) => c.id === "tools.descriptions");
    expect(check?.status).toBe("warn");
  });

  it("treats a whitespace-only description the same as missing", () => {
    const outcome = validateTools([{ name: "a", description: "   ", inputSchema: okSchema }]);
    expect(outcome.warnings.some((w) => w.code === "tools.missing_description")).toBe(true);
  });

  it("rejects a non-object inputSchema as structurally invalid", () => {
    const outcome = validateTools([{ name: "a", description: "x", inputSchema: "not-a-schema" }]);
    expect(outcome.errors.some((e) => e.code === "tools.invalid_schema")).toBe(true);
  });

  it("rejects an inputSchema whose declared type is not 'object'", () => {
    const outcome = validateTools([
      { name: "a", description: "x", inputSchema: { type: "string" } },
    ]);
    expect(outcome.errors.some((e) => e.code === "tools.invalid_schema")).toBe(true);
  });

  it("accepts an inputSchema with no declared type (still object-shaped)", () => {
    const outcome = validateTools([
      { name: "a", description: "x", inputSchema: { properties: {} } },
    ]);
    expect(outcome.errors.some((e) => e.code === "tools.invalid_schema")).toBe(false);
  });

  it("handles an empty tool list cleanly", () => {
    const outcome = validateTools([]);
    expect(outcome.errors).toEqual([]);
    expect(outcome.warnings).toEqual([]);
    expect(outcome.checks.every((c) => c.status === "pass")).toBe(true);
  });
});
