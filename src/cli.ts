import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { lintQuadlet } from "./index.js";
import { expectedSectionFor } from "./sections.js";

/**
 * Lint `text` (the contents of `fileName`) and format the diagnostics as
 * plain-text lines suitable for CLI output.
 */
export function runLint(text: string, fileName: string): { output: string; exitCode: number } {
  const diagnostics = lintQuadlet(text, { fileName });

  const output = diagnostics
    .map((d) => `${fileName}:${d.line}:${d.startColumn}: ${d.severity} ${d.code} ${d.message}`)
    .join("\n");

  const exitCode = diagnostics.some((d) => d.severity === "error") ? 1 : 0;

  return { output, exitCode };
}

/**
 * Recursively collect Quadlet files below `dir`. Only entries that
 * `expectedSectionFor` recognizes are kept, so drop-in `.conf` files and
 * every other Quadlet extension are picked up the same way Quadlet itself
 * would resolve them, and stray non-Quadlet files are silently skipped.
 *
 * Uses `dirent.isDirectory()` to decide whether to recurse, which reports
 * `false` for symlinks, so a directory symlink is never followed. That
 * keeps this safe against a symlink cycle without needing to track visited
 * paths.
 */
function walk(dir: string, results: Set<string>): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // The directory exists but can't be listed (permissions, or it vanished
    // mid-walk). Surface it as a path of its own rather than crashing:
    // runLintPaths then fails to read it, names it on stderr, and exits 2.
    // Skipping it silently would be worse, since the run would exit 0 and
    // look clean while quietly not linting files it was asked to lint.
    results.add(dir);
    return;
  }

  for (const dirent of entries) {
    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      walk(full, results);
    } else if (expectedSectionFor(full) !== null) {
      results.add(full);
    }
  }
}

/**
 * Expand `paths` (a mix of files and directories, as given on the CLI) into
 * a sorted, de-duplicated list of files to lint. Directories are walked
 * recursively and filtered down to Quadlet files; anything else (a file, or
 * a path that turns out not to exist) is passed through untouched so that
 * `runLintPaths` can still open it, report a missing-file error, and exit
 * non-zero for it.
 */
export function collectQuadletFiles(paths: string[]): string[] {
  const results = new Set<string>();

  for (const path of paths) {
    let isDirectory = false;
    try {
      isDirectory = statSync(path).isDirectory();
    } catch {
      isDirectory = false;
    }

    if (isDirectory) {
      walk(path, results);
    } else {
      results.add(path);
    }
  }

  return [...results].sort();
}

/**
 * Lint every path in `paths` and aggregate the results for the CLI. A path
 * that can't be read is reported in `errorOutput` and does not stop the
 * remaining paths from being linted; it does force the exit code to `2`,
 * which takes priority over an ordinary lint error (`1`) since a missing
 * file means the run couldn't even inspect everything it was asked to.
 */
export function runLintPaths(paths: string[]): {
  output: string;
  errorOutput: string;
  exitCode: number;
} {
  const outputs: string[] = [];
  const errors: string[] = [];
  let hasLintError = false;

  for (const path of paths) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (err) {
      errors.push(`quadlet-lint: cannot read ${path}: ${(err as Error).message}`);
      continue;
    }

    const { output, exitCode } = runLint(text, path);
    if (output) outputs.push(output);
    if (exitCode === 1) hasLintError = true;
  }

  const exitCode = errors.length > 0 ? 2 : hasLintError ? 1 : 0;

  return {
    output: outputs.join("\n"),
    errorOutput: errors.join("\n"),
    exitCode,
  };
}
