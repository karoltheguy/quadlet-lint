import { lintQuadlet } from "./index.js";

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
