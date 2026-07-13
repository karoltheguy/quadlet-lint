/**
 * Monaco Editor adapter for quadlet-lint.
 *
 * This is a thin binding over the pure core: it converts {@link Diagnostic}s
 * into Monaco marker data and, optionally, pushes them onto a model. Monaco is
 * an optional peer dependency — only import this entry point if you use Monaco.
 */

import type * as monaco from "monaco-editor";
import { lintQuadlet, type Diagnostic } from "./index.js";

export { lintQuadlet } from "./index.js";
export type { Diagnostic, Severity } from "./index.js";

/** Default marker owner string passed to `setModelMarkers`. */
export const OWNER = "quadlet-lint";

/**
 * The slice of the Monaco namespace this adapter needs. Accepting it as an
 * argument (rather than importing the runtime) keeps the adapter agnostic to
 * how Monaco was loaded (bundler, AMD loader, CDN, etc.).
 */
export interface MonacoLike {
  MarkerSeverity: typeof monaco.MarkerSeverity;
  editor: Pick<typeof monaco.editor, "setModelMarkers">;
}

/** Convert a single diagnostic into Monaco marker data. */
export function toMarker(
  monacoNs: Pick<MonacoLike, "MarkerSeverity">,
  d: Diagnostic,
): monaco.editor.IMarkerData {
  return {
    severity:
      d.severity === "error"
        ? monacoNs.MarkerSeverity.Error
        : monacoNs.MarkerSeverity.Warning,
    message: d.message,
    code: d.code,
    startLineNumber: d.line,
    startColumn: d.startColumn,
    endLineNumber: d.line,
    endColumn: d.endColumn,
    source: OWNER,
  };
}

/** Convert a list of diagnostics into Monaco marker data. */
export function toMarkers(
  monacoNs: Pick<MonacoLike, "MarkerSeverity">,
  diagnostics: Diagnostic[],
): monaco.editor.IMarkerData[] {
  return diagnostics.map((d) => toMarker(monacoNs, d));
}

/**
 * Lint a model's current text and publish the results as markers.
 *
 * Typical wiring:
 *
 * ```ts
 * import * as monaco from "monaco-editor";
 * import { lintModel } from "quadlet-lint/monaco";
 *
 * const model = editor.getModel()!;
 * lintModel(monaco, model);
 * model.onDidChangeContent(() => lintModel(monaco, model));
 * ```
 *
 * @returns the diagnostics that were published (handy for testing/telemetry).
 */
export function lintModel(
  monacoNs: MonacoLike,
  model: monaco.editor.ITextModel,
  owner: string = OWNER,
): Diagnostic[] {
  const diagnostics = lintQuadlet(model.getValue());
  monacoNs.editor.setModelMarkers(model, owner, toMarkers(monacoNs, diagnostics));
  return diagnostics;
}
