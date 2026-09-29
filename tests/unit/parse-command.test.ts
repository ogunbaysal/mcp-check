import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEOUT_MS, parseCliArgs } from "../../src/cli/parse-command.js";

describe("parseCliArgs", () => {
  it("parses a bare command with no options", () => {
    const result = parseCliArgs(["node", "server.js"]);
    expect(result).toEqual({
      ok: true,
      value: {
        help: false,
        version: false,
        json: false,
        quiet: false,
        verbose: false,
        strict: false,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        env: {},
        command: "node",
        commandArgs: ["server.js"],
      },
    });
  });

  it("parses a multi-word command with its own arguments", () => {
    const result = parseCliArgs(["npx", "@my-org/my-mcp-server", "--flag"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.command).toBe("npx");
    expect(result.value.commandArgs).toEqual(["@my-org/my-mcp-server", "--flag"]);
  });

  it("recognizes leading flags before the command", () => {
    const result = parseCliArgs(["--json", "--strict", "--verbose", "node", "server.js"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.json).toBe(true);
    expect(result.value.strict).toBe(true);
    expect(result.value.verbose).toBe(true);
    expect(result.value.command).toBe("node");
  });

  it("parses --timeout with a space-separated value", () => {
    const result = parseCliArgs(["--timeout", "30000", "node", "server.js"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.timeoutMs).toBe(30_000);
  });

  it("parses --timeout=<value> syntax", () => {
    const result = parseCliArgs(["--timeout=5000", "node", "server.js"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.timeoutMs).toBe(5000);
  });

  it("rejects a non-numeric --timeout value", () => {
    const result = parseCliArgs(["--timeout", "abc", "node", "server.js"]);
    expect(result.ok).toBe(false);
  });

  it("rejects a zero or negative --timeout value", () => {
    expect(parseCliArgs(["--timeout", "0", "node", "x.js"]).ok).toBe(false);
    expect(parseCliArgs(["--timeout", "-5", "node", "x.js"]).ok).toBe(false);
  });

  it("rejects a missing --timeout value at end of argv", () => {
    const result = parseCliArgs(["--timeout"]);
    expect(result.ok).toBe(false);
  });

  it("does not treat flags appearing after the command as mcp-check's own", () => {
    const result = parseCliArgs(["node", "server.js", "--json", "--verbose"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.json).toBe(false);
    expect(result.value.verbose).toBe(false);
    expect(result.value.commandArgs).toEqual(["server.js", "--json", "--verbose"]);
  });

  it("treats -- as an explicit separator before the command", () => {
    const result = parseCliArgs(["--json", "--", "--not-a-flag", "arg"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.json).toBe(true);
    expect(result.value.command).toBe("--not-a-flag");
    expect(result.value.commandArgs).toEqual(["arg"]);
  });

  it("rejects an unknown leading flag", () => {
    const result = parseCliArgs(["--bogus", "node", "server.js"]);
    expect(result.ok).toBe(false);
  });

  it("rejects when no command is given and help/version were not requested", () => {
    const result = parseCliArgs([]);
    expect(result.ok).toBe(false);
  });

  it("allows --help with no command", () => {
    const result = parseCliArgs(["--help"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.help).toBe(true);
    expect(result.value.command).toBeNull();
  });

  it("allows --version with no command", () => {
    const result = parseCliArgs(["--version"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe(true);
  });

  it("supports -h and -q short flags", () => {
    const help = parseCliArgs(["-h"]);
    expect(help.ok).toBe(true);
    if (help.ok) expect(help.value.help).toBe(true);

    const quiet = parseCliArgs(["-q", "node", "server.js"]);
    expect(quiet.ok).toBe(true);
    if (quiet.ok) expect(quiet.value.quiet).toBe(true);
  });

  it("parses a single --env KEY=VALUE flag", () => {
    const result = parseCliArgs(["--env", "API_KEY=secret", "node", "server.js"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.env).toEqual({ API_KEY: "secret" });
  });

  it("parses --env=KEY=VALUE syntax", () => {
    const result = parseCliArgs(["--env=API_KEY=secret", "node", "server.js"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.env).toEqual({ API_KEY: "secret" });
  });

  it("accumulates repeated --env flags", () => {
    const result = parseCliArgs(["--env", "A=1", "--env", "B=2", "node", "server.js"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.env).toEqual({ A: "1", B: "2" });
  });

  it("keeps the equals sign(s) in the value, splitting only on the first one", () => {
    const result = parseCliArgs(["--env", "TOKEN=abc=def=123", "node", "server.js"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.env).toEqual({ TOKEN: "abc=def=123" });
  });

  it("lets a later --env win when the same key is repeated", () => {
    const result = parseCliArgs(["--env", "A=1", "--env", "A=2", "node", "server.js"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.env).toEqual({ A: "2" });
  });

  it("rejects --env without a value", () => {
    expect(parseCliArgs(["--env"]).ok).toBe(false);
  });

  it("rejects an --env value with no '=' separator", () => {
    expect(parseCliArgs(["--env", "NOTKEYVALUE", "node", "server.js"]).ok).toBe(false);
  });

  it("rejects an --env value with an empty key", () => {
    expect(parseCliArgs(["--env", "=value", "node", "server.js"]).ok).toBe(false);
  });

  it("does not treat --env after the command as mcp-check's own", () => {
    const result = parseCliArgs(["node", "server.js", "--env", "A=1"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.env).toEqual({});
    expect(result.value.commandArgs).toEqual(["server.js", "--env", "A=1"]);
  });
});
