import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { lintQuadlet, type Diagnostic } from "./index.js";
import { expectedSectionFor } from "./sections.js";
import { buildUnitIndex } from "./unit-index.js";

/** Output format for CLI diagnostics. */
export type OutputFormat = "text" | "json";

/** Options controlling how `runLintPaths` renders its diagnostics. */
export interface LintOptions {
  /** Output format. Defaults to `"text"`. */
  format?: OutputFormat;
  /**
   * Whether to colorize the text output with ANSI escapes. Ignored for JSON.
   * Defaults to `false`. The bin entry point decides this from the TTY and
   * `NO_COLOR`; the core never inspects `process` so it stays testable.
   */
  color?: boolean;
}

/** One diagnostic in the flat JSON output array, tagged with its file. */
interface JsonDiagnostic {
  file: string;
  line: number;
  startColumn: number;
  endColumn: number;
  severity: Diagnostic["severity"];
  code: string;
  message: string;
}

/**
 * Wrap `severity` in an ANSI color when `color` is set: red for errors,
 * yellow for warnings. Returns it untouched otherwise, which keeps the
 * default text format byte-identical to what the README and tests assert.
 */
function colorizeSeverity(severity: Diagnostic["severity"], color: boolean): string {
  if (!color) return severity;
  const code = severity === "error" ? "31" : "33";
  return `\x1b[${code}m${severity}\x1b[0m`;
}

/**
 * Render `diagnostics` (all belonging to `fileName`) as the plain-text CLI
 * format, one `file:line:col: severity code message` line each. With
 * `color`, only the severity token is colorized; the rest is unchanged so
 * the layout stays stable for anything parsing it.
 */
function formatDiagnosticsText(
  fileName: string,
  diagnostics: Diagnostic[],
  color: boolean,
): string {
  return diagnostics
    .map(
      (d) =>
        `${fileName}:${d.line}:${d.startColumn}: ${colorizeSeverity(d.severity, color)} ${d.code} ${d.message}`,
    )
    .join("\n");
}

/**
 * Lint `text` (the contents of `fileName`) and format the diagnostics as
 * plain-text lines suitable for CLI output.
 */
export function runLint(text: string, fileName: string): { output: string; exitCode: number } {
  const diagnostics = lintQuadlet(text, { fileName });

  const output = formatDiagnosticsText(fileName, diagnostics, false);

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
export function runLintPaths(
  paths: string[],
  options: LintOptions = {},
): {
  output: string;
  errorOutput: string;
  exitCode: number;
} {
  const format = options.format ?? "text";
  const color = options.color ?? false;

  const textOutputs: string[] = [];
  const jsonDiagnostics: JsonDiagnostic[] = [];
  const errors: string[] = [];
  let hasLintError = false;

  // Built once, over every path in this run, so future cross-unit checks see
  // the whole scanned set rather than just the file currently being linted.
  // A single-file run simply gets a one-entry index.
  const unitIndex = buildUnitIndex(paths);

  for (const path of paths) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (err) {
      errors.push(`quadlet-lint: cannot read ${path}: ${(err as Error).message}`);
      continue;
    }

    const diagnostics = lintQuadlet(text, { fileName: path, unitIndex });
    if (diagnostics.some((d) => d.severity === "error")) hasLintError = true;

    if (format === "json") {
      for (const d of diagnostics) {
        jsonDiagnostics.push({
          file: path,
          line: d.line,
          startColumn: d.startColumn,
          endColumn: d.endColumn,
          severity: d.severity,
          code: d.code,
          message: d.message,
        });
      }
    } else {
      const rendered = formatDiagnosticsText(path, diagnostics, color);
      if (rendered) textOutputs.push(rendered);
    }
  }

  const exitCode = errors.length > 0 ? 2 : hasLintError ? 1 : 0;

  // JSON always emits a valid document (an empty array for a clean run) so a
  // consumer can parse stdout unconditionally. Text stays empty when there is
  // nothing to report, which the existing tests and README rely on.
  const output =
    format === "json" ? JSON.stringify(jsonDiagnostics, null, 2) : textOutputs.join("\n");

  return {
    output,
    errorOutput: errors.join("\n"),
    exitCode,
  };
}

const USAGE = "usage: quadlet-lint [--format text|json] <file-or-directory>...";

/** Parsed CLI arguments, or an error message ready to print on stderr. */
export type ParsedArgs = { paths: string[]; format: OutputFormat } | { error: string };

/**
 * Parse the CLI argument vector (everything after the node script name) into
 * paths and an output format. Recognizes `--format <fmt>` / `-f <fmt>` and
 * `--format=<fmt>`; every other token is treated as a path, so a bare
 * `quadlet-lint <file>` keeps working. Returns an `error` message (no
 * trailing newline) for a missing format value, an unknown format, or no
 * paths at all. Kept here rather than in `bin/` so it can be unit-tested; the
 * bin entry point only adds the impure TTY / `NO_COLOR` color decision.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const paths: string[] = [];
  let format = "text";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--format" || arg === "-f") {
      const value = argv[++i];
      if (value === undefined) {
        return { error: `quadlet-lint: ${arg} requires an argument\n${USAGE}` };
      }
      format = value;
    } else if (arg.startsWith("--format=")) {
      format = arg.slice("--format=".length);
    } else {
      paths.push(arg);
    }
  }

  if (format !== "text" && format !== "json") {
    return { error: `quadlet-lint: unknown format "${format}" (expected text or json)\n${USAGE}` };
  }
  if (paths.length === 0) {
    return { error: USAGE };
  }

  return { paths, format };
}
