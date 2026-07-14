#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runLint } from "../dist/cli.js";

const file = process.argv[2];
if (!file) {
  process.stderr.write("usage: quadlet-lint <file>\n");
  process.exit(2);
}

let text;
try {
  text = readFileSync(file, "utf8");
} catch (err) {
  process.stderr.write(`quadlet-lint: cannot read ${file}: ${err.message}\n`);
  process.exit(2);
}

const { output, exitCode } = runLint(text, file);
if (output) process.stdout.write(output + "\n");
process.exit(exitCode);
