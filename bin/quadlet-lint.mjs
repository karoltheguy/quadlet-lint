#!/usr/bin/env node
import { collectQuadletFiles, parseArgs, runLintPaths } from "../dist/cli.js";

const parsed = parseArgs(process.argv.slice(2));
if ("error" in parsed) {
  process.stderr.write(parsed.error + "\n");
  process.exit(2);
}

// Color is decided here, at the impure edge, so the CLI core never touches
// process. Honor NO_COLOR (https://no-color.org) and only colorize a TTY.
const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const { output, errorOutput, exitCode } = runLintPaths(collectQuadletFiles(parsed.paths), {
  format: parsed.format,
  color,
});
if (output) process.stdout.write(output + "\n");
if (errorOutput) process.stderr.write(errorOutput + "\n");
process.exit(exitCode);
