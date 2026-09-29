import type { CheckItem, Diagnostic } from "../core/result.js";

export interface ResourceLike {
  uri: string;
  name: string;
}

export interface ResourceValidationOutcome {
  checks: CheckItem[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

/** A URI must have a `scheme:` prefix to be usable by `resources/read`. */
function isWellFormedUri(uri: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\S/.test(uri);
}

export function validateResources(resources: readonly ResourceLike[]): ResourceValidationOutcome {
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];

  const missingUri = resources.filter((r) => r.uri.trim().length === 0);
  const missingName = resources.filter((r) => r.name.trim().length === 0);
  const malformed = resources.filter((r) => r.uri.trim().length > 0 && !isWellFormedUri(r.uri));

  const uriCounts = new Map<string, number>();
  for (const resource of resources) {
    uriCounts.set(resource.uri, (uriCounts.get(resource.uri) ?? 0) + 1);
  }
  const duplicateUris = [...uriCounts.entries()].filter(([, count]) => count > 1);

  const checks: CheckItem[] = [
    missingUri.length === 0
      ? { id: "resources.uri", label: "All resources have a URI", status: "pass" }
      : {
          id: "resources.uri",
          label: `${String(missingUri.length)} resource(s) have no URI`,
          status: "fail",
          detail: `${String(missingUri.length)} of ${String(resources.length)} resources are missing a uri.`,
        },
    missingName.length === 0
      ? { id: "resources.name", label: "All resources have a name", status: "pass" }
      : {
          id: "resources.name",
          label: `${String(missingName.length)} resource(s) have no name`,
          status: "fail",
          detail: missingName.map((r) => r.uri || "(no uri)").join(", "),
        },
    duplicateUris.length === 0
      ? { id: "resources.unique_uris", label: "Resource URIs are unique", status: "pass" }
      : {
          id: "resources.unique_uris",
          label: "Resource URIs are unique",
          status: "fail",
          detail: `Duplicate URI(s): ${duplicateUris.map(([uri]) => uri).join(", ")}`,
        },
    malformed.length === 0
      ? { id: "resources.well_formed_uri", label: "Resource URIs are well-formed", status: "pass" }
      : {
          id: "resources.well_formed_uri",
          label: "Resource URIs are well-formed",
          status: "fail",
          detail: `Malformed URI(s): ${malformed.map((r) => r.uri).join(", ")}`,
        },
  ];

  if (missingUri.length > 0) {
    errors.push({
      code: "resources.missing_uri",
      message: "One or more resources have no URI",
      detail: `${String(missingUri.length)} of ${String(resources.length)} resources`,
    });
  }
  if (missingName.length > 0) {
    errors.push({
      code: "resources.missing_name",
      message: "One or more resources have no name",
      detail: missingName.map((r) => r.uri || "(no uri)").join(", "),
    });
  }
  if (duplicateUris.length > 0) {
    errors.push({
      code: "resources.duplicate_uri",
      message: "Resource URIs must be unique",
      detail: duplicateUris.map(([uri, count]) => `${uri} (${String(count)}x)`).join(", "),
    });
  }
  if (malformed.length > 0) {
    errors.push({
      code: "resources.malformed_uri",
      message: "One or more resource URIs are malformed",
      detail: malformed.map((r) => r.uri).join(", "),
    });
  }

  return { checks, warnings, errors };
}
