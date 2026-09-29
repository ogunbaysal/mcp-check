import { parseCliArgs } from "./parse-command.js";
import { getVersion } from "./version.js";
import { HELP_TEXT, USAGE } from "./help-text.js";
import { runCheck } from "../core/run-check.js";
import { renderHuman } from "../output/human.js";
import { renderJson } from "../output/json.js";
import { ExitCode } from "../core/exit-codes.js";

async function main(): Promise<number> {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (!parsed.ok) {
    process.stderr.write(`Error: ${parsed.error}\n\n${USAGE}\n`);
    return ExitCode.InvalidUsage;
  }
  const args = parsed.value;

  if (args.help) {
    process.stdout.write(HELP_TEXT);
    return ExitCode.Success;
  }
  if (args.version) {
    process.stdout.write(`${getVersion()}\n`);
    return ExitCode.Success;
  }
  // parseCliArgs guarantees `command` is set once help/version are ruled out.
  const command = args.command;
  if (command === null) {
    process.stderr.write(`Error: No command specified.\n\n${USAGE}\n`);
    return ExitCode.InvalidUsage;
  }

  const result = await runCheck({
    command,
    args: args.commandArgs,
    timeoutMs: args.timeoutMs,
    strict: args.strict,
    env: args.env,
    clientVersion: getVersion(),
  });

  if (args.json) {
    process.stdout.write(renderJson(result, { verbose: args.verbose }) + "\n");
  } else {
    process.stdout.write(renderHuman(result, { verbose: args.verbose, quiet: args.quiet }));
  }

  return result.exitCode;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`Unexpected error in mcp-check:\n${message}\n`);
    process.exitCode = ExitCode.ProcessError;
  });
