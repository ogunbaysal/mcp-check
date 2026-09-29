import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJsonShape {
  name?: string;
  version?: string;
}

const MAX_ANCESTORS = 5;

let cachedVersion: string | undefined;

/**
 * Reads this package's version from its own package.json by walking up from
 * the current module's directory. A fixed relative offset (e.g.
 * "../package.json") would break depending on execution context: the
 * bundled dist/index.js sits one directory below the package root, but
 * running src/cli/version.ts directly (as tests do) sits two directories
 * below it. Walking up and checking `name` avoids hard-coding either depth.
 */
export function getVersion(): string {
  if (cachedVersion) return cachedVersion;

  let dir = dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < MAX_ANCESTORS; hop++) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as PackageJsonShape;
      if (parsed.name === "mcp-probe" && parsed.version) {
        cachedVersion = parsed.version;
        return cachedVersion;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cachedVersion = "0.0.0";
  return cachedVersion;
}
