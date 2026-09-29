import { describe, expect, it } from "vitest";
import { validateResources } from "../../src/validation/resources.js";

describe("validateResources", () => {
  it("passes every check for a well-formed resource list", () => {
    const outcome = validateResources([
      { uri: "file:///a.txt", name: "a" },
      { uri: "config://app/settings", name: "settings" },
    ]);
    expect(outcome.errors).toEqual([]);
    expect(outcome.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("flags duplicate URIs as an error", () => {
    const outcome = validateResources([
      { uri: "file:///a.txt", name: "a" },
      { uri: "file:///a.txt", name: "a-again" },
    ]);
    expect(outcome.errors.some((e) => e.code === "resources.duplicate_uri")).toBe(true);
    expect(outcome.checks.find((c) => c.id === "resources.unique_uris")?.status).toBe("fail");
  });

  it("flags a missing URI as an error", () => {
    const outcome = validateResources([{ uri: "", name: "a" }]);
    expect(outcome.errors.some((e) => e.code === "resources.missing_uri")).toBe(true);
  });

  it("flags a missing name as an error", () => {
    const outcome = validateResources([{ uri: "file:///a.txt", name: "" }]);
    expect(outcome.errors.some((e) => e.code === "resources.missing_name")).toBe(true);
  });

  it("flags a URI with no scheme as malformed", () => {
    const outcome = validateResources([{ uri: "not-a-uri", name: "a" }]);
    expect(outcome.errors.some((e) => e.code === "resources.malformed_uri")).toBe(true);
  });

  it("does not double-report a missing URI as also malformed", () => {
    const outcome = validateResources([{ uri: "", name: "a" }]);
    expect(outcome.errors.some((e) => e.code === "resources.malformed_uri")).toBe(false);
  });

  it("handles an empty resource list cleanly", () => {
    const outcome = validateResources([]);
    expect(outcome.errors).toEqual([]);
    expect(outcome.checks.every((c) => c.status === "pass")).toBe(true);
  });
});
