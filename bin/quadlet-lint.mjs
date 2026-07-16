#!/usr/bin/env node
import { collectQuadletFiles, runLintPaths } from "../dist/cli.js";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  process.stderr.write("usage: quadlet-lint <file-or-directory>...\n");
  process.exit(2);
}

const { output, errorOutput, exitCode } = runLintPaths(collectQuadletFiles(paths));
if (output) process.stdout.write(output + "\n");
if (errorOutput) process.stderr.write(errorOutput + "\n");
process.exit(exitCode);
