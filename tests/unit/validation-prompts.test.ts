import { describe, expect, it } from "vitest";
import { validatePrompts } from "../../src/validation/prompts.js";

describe("validatePrompts", () => {
  it("passes every check for a well-formed prompt list", () => {
    const outcome = validatePrompts([
      { name: "greet", arguments: [{ name: "who" }] },
      { name: "summarize" },
    ]);
    expect(outcome.errors).toEqual([]);
    expect(outcome.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("flags duplicate prompt names as an error", () => {
    const outcome = validatePrompts([{ name: "dup" }, { name: "dup" }]);
    expect(outcome.errors.some((e) => e.code === "prompts.duplicate_name")).toBe(true);
  });

  it("flags an empty prompt name as an error", () => {
    const outcome = validatePrompts([{ name: "" }]);
    expect(outcome.errors.some((e) => e.code === "prompts.empty_name")).toBe(true);
  });

  it("flags an argument with an empty name as invalid", () => {
    const outcome = validatePrompts([{ name: "greet", arguments: [{ name: "" }] }]);
    expect(outcome.errors.some((e) => e.code === "prompts.invalid_arguments")).toBe(true);
  });

  it("flags duplicate argument names within a single prompt as invalid", () => {
    const outcome = validatePrompts([
      { name: "greet", arguments: [{ name: "who" }, { name: "who" }] },
    ]);
    expect(outcome.errors.some((e) => e.code === "prompts.invalid_arguments")).toBe(true);
  });

  it("handles an empty prompt list cleanly", () => {
    const outcome = validatePrompts([]);
    expect(outcome.errors).toEqual([]);
    expect(outcome.checks.every((c) => c.status === "pass")).toBe(true);
  });
});
