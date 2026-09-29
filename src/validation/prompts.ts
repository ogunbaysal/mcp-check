import type { CheckItem, Diagnostic } from "../core/result.js";

export interface PromptArgumentLike {
  name: string;
}

export interface PromptLike {
  name: string;
  arguments?: PromptArgumentLike[] | undefined;
}

export interface PromptValidationOutcome {
  checks: CheckItem[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

export function validatePrompts(prompts: readonly PromptLike[]): PromptValidationOutcome {
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];

  const emptyNamed = prompts.filter((p) => p.name.trim().length === 0);

  const nameCounts = new Map<string, number>();
  for (const prompt of prompts) {
    nameCounts.set(prompt.name, (nameCounts.get(prompt.name) ?? 0) + 1);
  }
  const duplicateNames = [...nameCounts.entries()].filter(([, count]) => count > 1);

  const invalidArguments = prompts.filter((prompt) => {
    const args = prompt.arguments ?? [];
    const emptyArgName = args.some((arg) => arg.name.trim().length === 0);
    const argNames = args.map((arg) => arg.name);
    const hasDuplicateArgs = new Set(argNames).size !== argNames.length;
    return emptyArgName || hasDuplicateArgs;
  });

  const checks: CheckItem[] = [
    emptyNamed.length === 0
      ? { id: "prompts.names", label: "All prompts have names", status: "pass" }
      : {
          id: "prompts.names",
          label: `${String(emptyNamed.length)} prompt(s) have an empty name`,
          status: "fail",
          detail: `${String(emptyNamed.length)} of ${String(prompts.length)} prompts have an empty or whitespace-only name.`,
        },
    duplicateNames.length === 0
      ? { id: "prompts.unique_names", label: "Prompt names are unique", status: "pass" }
      : {
          id: "prompts.unique_names",
          label: "Prompt names are unique",
          status: "fail",
          detail: `Duplicate prompt name(s): ${duplicateNames.map(([name]) => name).join(", ")}`,
        },
    invalidArguments.length === 0
      ? {
          id: "prompts.arguments",
          label: "Prompt arguments are structurally valid",
          status: "pass",
        }
      : {
          id: "prompts.arguments",
          label: "Prompt arguments are structurally valid",
          status: "fail",
          detail: `Invalid arguments on: ${invalidArguments.map((p) => p.name || "(unnamed)").join(", ")}`,
        },
  ];

  if (emptyNamed.length > 0) {
    errors.push({
      code: "prompts.empty_name",
      message: "One or more prompts have an empty name",
      detail: `${String(emptyNamed.length)} of ${String(prompts.length)} prompts`,
    });
  }
  if (duplicateNames.length > 0) {
    errors.push({
      code: "prompts.duplicate_name",
      message: "Prompt names must be unique",
      detail: duplicateNames.map(([name, count]) => `${name} (${String(count)}x)`).join(", "),
    });
  }
  if (invalidArguments.length > 0) {
    errors.push({
      code: "prompts.invalid_arguments",
      message: "One or more prompts have invalid arguments",
      detail: invalidArguments.map((p) => p.name || "(unnamed)").join(", "),
    });
  }

  return { checks, warnings, errors };
}
