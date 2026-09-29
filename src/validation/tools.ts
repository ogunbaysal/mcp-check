import type { CheckItem, Diagnostic } from "../core/result.js";

/** The subset of an MCP `Tool` object that validation actually inspects. */
export interface ToolLike {
  name: string;
  description?: string | undefined;
  inputSchema?: unknown;
}

export interface ToolValidationOutcome {
  checks: CheckItem[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

/** True when `schema` looks like a plausible JSON Schema object for a tool's input. */
function isPlausibleInputSchema(schema: unknown): boolean {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return false;
  const record = schema as Record<string, unknown>;
  if ("type" in record && record.type !== "object") return false;
  return true;
}

/**
 * Validates a list of tools returned by `tools/list`. Structural correctness
 * (types, required fields) is already enforced by the SDK's zod schemas
 * before this ever runs; these checks cover semantic quality that the wire
 * schema alone cannot: uniqueness, non-empty identifiers, and description
 * hygiene.
 */
export function validateTools(tools: readonly ToolLike[]): ToolValidationOutcome {
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];

  const emptyNamed = tools.filter((tool) => tool.name.trim().length === 0);
  const nameCounts = new Map<string, number>();
  for (const tool of tools) {
    nameCounts.set(tool.name, (nameCounts.get(tool.name) ?? 0) + 1);
  }
  const duplicateNames = [...nameCounts.entries()].filter(([, count]) => count > 1);

  const invalidSchemas = tools.filter((tool) => !isPlausibleInputSchema(tool.inputSchema));

  const undocumented = tools.filter(
    (tool) => !tool.description || tool.description.trim().length === 0,
  );

  const checks: CheckItem[] = [
    emptyNamed.length === 0
      ? { id: "tools.names", label: "All tools have names", status: "pass" }
      : {
          id: "tools.names",
          label: `${String(emptyNamed.length)} tool(s) have an empty name`,
          status: "fail",
          detail: `${String(emptyNamed.length)} of ${String(tools.length)} tools have an empty or whitespace-only name.`,
        },
    duplicateNames.length === 0
      ? { id: "tools.unique_names", label: "Tool names are unique", status: "pass" }
      : {
          id: "tools.unique_names",
          label: "Tool names are unique",
          status: "fail",
          detail: `Duplicate tool name(s): ${duplicateNames.map(([name]) => name).join(", ")}`,
        },
    invalidSchemas.length === 0
      ? { id: "tools.input_schema", label: "Input schemas are structurally valid", status: "pass" }
      : {
          id: "tools.input_schema",
          label: "Input schemas are structurally valid",
          status: "fail",
          detail: `Invalid inputSchema on: ${invalidSchemas.map((t) => t.name || "(unnamed)").join(", ")}`,
        },
    undocumented.length === 0
      ? { id: "tools.descriptions", label: "All tools have descriptions", status: "pass" }
      : {
          id: "tools.descriptions",
          label: `${String(undocumented.length)} tool(s) have no description`,
          status: "warn",
          detail: `Missing description: ${undocumented.map((t) => t.name || "(unnamed)").join(", ")}`,
        },
  ];

  if (emptyNamed.length > 0) {
    errors.push({
      code: "tools.empty_name",
      message: "One or more tools have an empty name",
      detail: `${String(emptyNamed.length)} of ${String(tools.length)} tools`,
    });
  }
  if (duplicateNames.length > 0) {
    errors.push({
      code: "tools.duplicate_name",
      message: "Tool names must be unique",
      detail: duplicateNames.map(([name, count]) => `${name} (${String(count)}x)`).join(", "),
    });
  }
  if (invalidSchemas.length > 0) {
    errors.push({
      code: "tools.invalid_schema",
      message: "One or more tools have an invalid inputSchema",
      detail: invalidSchemas.map((t) => t.name || "(unnamed)").join(", "),
    });
  }
  if (undocumented.length > 0) {
    warnings.push({
      code: "tools.missing_description",
      message: `${String(undocumented.length)} tool(s) have no description`,
      detail: undocumented.map((t) => t.name || "(unnamed)").join(", "),
    });
  }

  return { checks, warnings, errors };
}
